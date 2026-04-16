#!/usr/bin/env python3
"""validate.py — post-generation navigation validator.

Input: an HTML file path + classification tags.
Output: JSON violation report on stdout. Exit 0 = pass, 1 = violations found.

Invoked by the patched stitch-design pipeline after every generation. Also
callable standalone for debugging.

Usage:
  python3 validate.py --file /path/to/generated.html \
      --surface session-auth-client \
      --archetype detail \
      --viewport mobile

The rubric is hard-coded here rather than pulled from NAVIGATION.md — the spec
describes intent; this script is the enforcement shape. If rules need tuning,
edit this file (and bump the spec-version that consumes it).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field


@dataclass
class Violation:
    rule: str
    selector: str
    severity: str  # "cosmetic" | "semantic" | "structural"
    message: str
    fix: str


SURFACE_AUTHENTICATED = {"session-auth-client", "session-auth-admin", "token-auth"}
SURFACE_ALL = SURFACE_AUTHENTICATED | {"public", "auth-gate"}

# Token-acceptance forms — the spec (Section 4, Section 6) accepts any of these
# as equivalent expressions of a color token. Validator checks should not falsely
# flag one form when another is required; all three resolve to the same hex via
# the project's `@theme` block in global.css.
#
# Extend this map per token when new tokens are added. See NAVIGATION.md §4.
TOKEN_EQUIVALENCES = {
    "border": {
        "literal": {"#e2e8f0", "#E2E8F0"},
        "var": "var(--color-border)",
        "tailwind": "slate-200",
    },
    "text-default": {
        "literal": {"#475569"},
        "var": "var(--color-text-secondary)",
        "tailwind": "slate-600",
    },
    "text-bold": {
        "literal": {"#0f172a", "#0F172A"},
        "var": "var(--color-text-primary)",
        "tailwind": "slate-900",
    },
    "primary": {
        "literal": {"#1e40af", "#1E40AF"},
        "var": "var(--color-primary)",
        "tailwind": "blue-800",
    },
    "focus": {
        "literal": {"#3b82f6", "#3B82F6"},
        "var": "var(--color-action)",
        "tailwind": "blue-500",
    },
    "disabled": {
        "literal": {"#94a3b8", "#94A3B8"},
        "var": "var(--color-text-muted)",
        "tailwind": "slate-400",
    },
}


def accepts_border_token(class_str: str) -> bool:
    """Return True if the class string contains any accepted form of the border token."""
    if any(h in class_str for h in TOKEN_EQUIVALENCES["border"]["literal"]):
        return True
    if TOKEN_EQUIVALENCES["border"]["var"] in class_str:
        return True
    if f"border-{TOKEN_EQUIVALENCES['border']['tailwind']}" in class_str:
        return True
    return False

# Load HTML as text; we regex it rather than require beautifulsoup4.
# Accept a small tolerance for Tailwind class-list ordering.


def find_header_block(html: str) -> tuple[str, str] | None:
    """Return (full tag, class attribute) of the first <header> element, or None."""
    m = re.search(r"<header\b([^>]*)>", html, re.IGNORECASE)
    if not m:
        return None
    attrs = m.group(1)
    cls = re.search(r'class="([^"]*)"', attrs)
    return (m.group(0), cls.group(1) if cls else "")


def check(html: str, surface: str, archetype: str, viewport: str) -> list[Violation]:
    violations: list[Violation] = []

    header = find_header_block(html)

    # R1 — Header sticky, not fixed
    if header:
        _, hclass = header
        if re.search(r'\bfixed\s+top-0\b|\bfixed\b(?=[^"]*\btop-0\b)', hclass):
            violations.append(Violation(
                rule="R1",
                selector="<header>",
                severity="semantic",
                message="Header uses `fixed top-0` instead of `sticky top-0`.",
                fix="Replace `fixed top-0` with `sticky top-0`. Fixed removes the header from document flow.",
            ))

    # R2 — Solid header bg (no backdrop-blur, no opacity, no non-white hex)
    if header and surface != "public":
        _, hclass = header
        if re.search(r"backdrop-blur-", hclass):
            violations.append(Violation(
                rule="R2",
                selector="<header>",
                severity="cosmetic",
                message="Header uses `backdrop-blur-*` (glassmorphism).",
                fix="Replace with solid `bg-white`.",
            ))
        # bg-white/85, bg-slate-900/50, etc. (opacity modifiers)
        if re.search(r"bg-[a-z0-9\-]+/\d+", hclass):
            violations.append(Violation(
                rule="R2b",
                selector="<header>",
                severity="cosmetic",
                message="Header background uses opacity modifier (e.g., `bg-white/85`).",
                fix="Use solid `bg-white` (no opacity suffix).",
            ))

    # R3 — Client name stands alone (no icon/svg decoration BEFORE the first
    # text-bearing element in the header). Icons that appear AFTER the client
    # name text — e.g., the three-icon contact control on the right — are fine.
    if header and surface in SURFACE_AUTHENTICATED:
        hstart = html.find("<header")
        hend = html.find("</header>", hstart) if hstart >= 0 else -1
        if hstart >= 0 and hend > hstart:
            hinner = html[hstart:hend]
            # Find the first element that renders visible text. We look for
            # the first `>` followed by (optional whitespace) letters. This
            # skips past element tags to find the first text node.
            first_text_match = re.search(r">\s*([A-Za-z][^<]{2,})<", hinner)
            first_text_pos = first_text_match.start() if first_text_match else len(hinner)
            # Look for material-symbols or img/svg BEFORE that first text element
            prefix = hinner[:first_text_pos]
            if re.search(r'<span[^>]*class="[^"]*material-symbols-[a-z]+', prefix) \
               or re.search(r"<svg\b", prefix) \
               or re.search(r"<img\b", prefix):
                violations.append(Violation(
                    rule="R3",
                    selector="<header> first child (before client name)",
                    severity="cosmetic",
                    message="Header contains an icon, image, or SVG decoration before the client name text.",
                    fix="Remove the decorative element. Client name stands alone; contact icons or actions belong after the name, on the right.",
                ))

    # R4 — Back not wrapped in <nav aria-label="Breadcrumb">
    # Find all such navs; check if any contain exactly one link
    breadcrumb_navs = re.findall(
        r'<nav[^>]+aria-label="Breadcrumb"[^>]*>(.*?)</nav>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    for nav_inner in breadcrumb_navs:
        # Count visible <a> or <button> children
        count = len(re.findall(r"<a\b|<button\b", nav_inner))
        # A true breadcrumb has multiple levels; a single link wrapped is a violation
        # Allow if this surface-class/archetype permits breadcrumbs (admin list/detail)
        allows_breadcrumbs = (surface == "session-auth-admin" and archetype in {"list", "detail"})
        if not allows_breadcrumbs and count >= 1:
            violations.append(Violation(
                rule="R4",
                selector='<nav aria-label="Breadcrumb">',
                severity="semantic",
                message="Back affordance is wrapped in a breadcrumb nav element on a surface where breadcrumbs are forbidden.",
                fix="Unwrap. Use a single `<a>` or `<button>` with `aria-label` describing the target.",
            ))
        elif allows_breadcrumbs and count == 1:
            violations.append(Violation(
                rule="R4b",
                selector='<nav aria-label="Breadcrumb">',
                severity="semantic",
                message="Breadcrumb nav wraps a single link — this is a back button, not a breadcrumb trail.",
                fix="Unwrap. Breadcrumbs require multiple levels.",
            ))

    # R5 — Back href is a canonical URL
    # On detail archetypes, find the back-chevron anchor and check its href.
    if archetype == "detail":
        # Look for <a> elements containing chevron_left / arrow_back icons
        back_anchors = re.findall(
            r'<a[^>]+href="([^"]*)"[^>]*>.*?(?:chevron_left|arrow_back).*?</a>',
            html,
            re.DOTALL,
        )
        for href in back_anchors:
            if href.strip() in {"#", "javascript:void(0)", "javascript:"}:
                violations.append(Violation(
                    rule="R5",
                    selector=f'<a href="{href}">',
                    severity="semantic",
                    message=f"Back link uses placeholder `href=\"{href}\"`.",
                    fix="Use a hardcoded canonical URL string (e.g., `/portal/invoices`, `/portal/home`). Never `#`, `javascript:`, or `history.back()`.",
                ))
        # Also detect onclick=history.back
        if re.search(r"onclick=\"history\.back\(\)\"", html):
            violations.append(Violation(
                rule="R5b",
                selector="onclick=history.back()",
                severity="semantic",
                message="Back affordance uses `history.back()`.",
                fix="Replace with hardcoded canonical URL in href. Deep-links have no history to go back to.",
            ))

    # R6 — No global nav tabs in header (more than 2 nav-like links or a tablist)
    # Admin surface class has a ratified exception (Appendix D.2); skip R6/R6b for admin.
    if header and surface != "session-auth-admin":
        hstart = html.find("<header")
        hend = html.find("</header>", hstart) if hstart >= 0 else -1
        if hstart >= 0 and hend > hstart:
            hinner = html[hstart:hend]
            if re.search(r'role="tablist"|role="tab"', hinner):
                violations.append(Violation(
                    rule="R6",
                    selector="<header> (role=tablist/tab)",
                    severity="structural",
                    message="Header contains tablist/tab roles — global nav tabs are forbidden.",
                    fix="Remove. Secondary navigation lives below the header as a section, not in the header.",
                ))
            # Count <a> with text children (rough nav-tab heuristic)
            anchors = re.findall(r"<a\b[^>]*>([^<]+)</a>", hinner)
            nav_like = [a for a in anchors if a.strip() and len(a.strip().split()) <= 3]
            # Three-icon contact control (mailto/sms/tel) in portal and token-auth
            # headers uses icon-only <a> elements — those have no text children and
            # do not match this regex, so they don't trip R6b. If someone renders
            # "Email" / "Text" / "Call" as text, we allow up to 3 short-text
            # contact links (not tabs).
            contact_verbs = {"email", "text", "call", "sms", "phone"}
            contact_like = [a for a in nav_like if any(verb in a.strip().lower().split() for verb in contact_verbs)]
            effective_tab_count = len(nav_like) - len(contact_like)
            if effective_tab_count >= 3:
                violations.append(Violation(
                    rule="R6b",
                    selector="<header> (3+ short-text links, excluding contact controls)",
                    severity="structural",
                    message=f"Header contains {effective_tab_count} short-text non-contact links — looks like a nav tab bar.",
                    fix="Remove nav-tab-style links from header. Allowed: client name + optional contact channels (email/text/call) + 1 secondary action.",
                ))

    # R7 — No sticky-bottom action bars or bottom-tab nav
    bottom_sticky = re.search(r'class="[^"]*\b(?:fixed|sticky)\s+bottom-0\b', html)
    if bottom_sticky and surface in SURFACE_ALL:
        # Allow only if inside a <dialog> or modal
        surrounding = html[max(0, bottom_sticky.start() - 200):bottom_sticky.end()]
        if "<dialog" not in surrounding and 'role="dialog"' not in surrounding:
            violations.append(Violation(
                rule="R7",
                selector="element with `fixed bottom-0` or `sticky bottom-0`",
                severity="structural",
                message="Sticky-bottom element outside a dialog (bottom-tab nav or duplicated action bar).",
                fix="Remove. Primary action should be reachable above the fold via document-flow scrolling.",
            ))

    # R8 — No <footer> on authenticated surfaces
    if surface in SURFACE_AUTHENTICATED:
        if re.search(r"<footer\b", html):
            violations.append(Violation(
                rule="R8",
                selector="<footer>",
                severity="structural",
                message="Footer rendered on authenticated surface.",
                fix="Remove the footer. Authenticated surfaces do not carry legal/copyright rows.",
            ))

    # R9 — No real-face photo placeholders
    real_face_srcs = re.findall(
        r'<img[^>]+src="([^"]+)"',
        html,
    )
    for src in real_face_srcs:
        if (re.search(r"googleusercontent\.com/aida[-/]", src)
                or "unsplash.com" in src
                or "pexels.com" in src):
            violations.append(Violation(
                rule="R9",
                selector=f'<img src="{src[:60]}...">',
                severity="structural",
                message="Image uses a real-face photo placeholder source.",
                fix="Replace with a solid-color circle containing initials. Never a real face.",
            ))
            break  # one violation is enough to flag

    # R10 — No marketing CTAs on authenticated surfaces
    if surface in SURFACE_AUTHENTICATED:
        marketing_patterns = [
            r"\b(?:schedule|book)\s+(?:a\s+)?(?:call|demo|meeting|consultation)\b",
            r"\bget\s+started\b",
            r"\blearn\s+more\b",
            r"\bsign\s+up\s+(?:now|today|free)\b",
        ]
        for pat in marketing_patterns:
            if re.search(pat, html, re.IGNORECASE):
                violations.append(Violation(
                    rule="R10",
                    selector=f"text match: {pat}",
                    severity="structural",
                    message="Marketing CTA copy on authenticated surface.",
                    fix="Remove. The user is already a customer; no marketing CTAs.",
                ))
                break

    # R11 — Header height matches viewport
    if header:
        _, hclass = header
        expected_mobile = {"h-14", "h-[56px]"}
        expected_desktop_any = {"h-16", "h-[64px]", "md:h-16", "md:h-[64px]"}
        has_h_class = re.search(r"\bh-\[?\d+(?:px)?\]?\b", hclass) or re.search(r"\bmd:h-\[?\d+(?:px)?\]?\b", hclass)
        if has_h_class:
            if viewport == "mobile" and not any(cls in hclass for cls in expected_mobile):
                # check for an exact match at least
                if not re.search(r"\b(?:h-14|h-\[56px\])\b", hclass):
                    violations.append(Violation(
                        rule="R11",
                        selector="<header>",
                        severity="cosmetic",
                        message="Header height does not match 56px (mobile).",
                        fix="Use `h-14` (56px) on mobile.",
                    ))
            if viewport == "desktop" and not any(cls in hclass for cls in expected_desktop_any):
                if not re.search(r"\b(?:h-16|h-\[64px\]|md:h-16|md:h-\[64px\])\b", hclass):
                    violations.append(Violation(
                        rule="R11",
                        selector="<header>",
                        severity="cosmetic",
                        message="Header height does not match 64px (desktop).",
                        fix="Use `h-16` (64px) or `md:h-16` on desktop.",
                    ))

    # R14 — Landmarks present
    if not re.search(r"<header\b[^>]*role=\"banner\"|<header\b", html):
        violations.append(Violation(
            rule="R14a",
            selector="<header>",
            severity="semantic",
            message="No <header> landmark element found.",
            fix="Wrap the top band in `<header role=\"banner\">` (or rely on the implicit role).",
        ))
    if not re.search(r"<main\b", html):
        violations.append(Violation(
            rule="R14b",
            selector="<main>",
            severity="semantic",
            message="No <main> landmark element found.",
            fix="Wrap primary content in `<main role=\"main\">`.",
        ))

    # R15 — Skip-to-main link
    # Accept any href pointing to the main landmark's id, as long as the link
    # is sr-only-until-focused. Common ids: main, main-content, content,
    # page-main. Attribute order (class= before href= vs after) varies; match
    # either form.
    skip_link_match = re.search(
        r'<a\b(?=[^>]*\bclass="[^"]*sr-only)[^>]*\bhref="#([a-zA-Z][\w-]*)"',
        html,
    )
    if not skip_link_match:
        violations.append(Violation(
            rule="R15",
            selector="skip-to-main link",
            severity="semantic",
            message="No skip-to-main link detected (must be sr-only <a> linking to the main landmark).",
            fix='Prepend `<a href="#main" class="sr-only focus:not-sr-only ...">Skip to main content</a>` before <header>. `<main>` must carry matching `id`.',
        ))
    else:
        target_id = skip_link_match.group(1)
        if not re.search(rf'<main\b[^>]*id="{re.escape(target_id)}"', html):
            violations.append(Violation(
                rule="R15b",
                selector=f'<main id="{target_id}">',
                severity="semantic",
                message=f'Skip-link targets #{target_id} but no <main id="{target_id}"> exists.',
                fix=f'Add `id="{target_id}"` to the <main> element.',
            ))

    return violations


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--surface", required=True,
                    choices=["public", "auth-gate", "token-auth", "session-auth-client", "session-auth-admin"])
    ap.add_argument("--archetype", required=True,
                    choices=["dashboard", "list", "detail", "form", "wizard", "empty", "error", "modal", "drawer"])
    ap.add_argument("--viewport", required=True, choices=["mobile", "desktop"])
    args = ap.parse_args()

    try:
        with open(args.file, "r", encoding="utf-8") as f:
            html = f.read()
    except FileNotFoundError:
        print(json.dumps({"error": f"File not found: {args.file}"}), file=sys.stderr)
        return 1
    except OSError as e:
        print(json.dumps({"error": f"Cannot read {args.file}: {e}"}), file=sys.stderr)
        return 1

    violations = check(html, args.surface, args.archetype, args.viewport)

    report = {
        "file": args.file,
        "surface": args.surface,
        "archetype": args.archetype,
        "viewport": args.viewport,
        "pass": len(violations) == 0,
        "violation_count": len(violations),
        "structural_count": sum(1 for v in violations if v.severity == "structural"),
        "semantic_count": sum(1 for v in violations if v.severity == "semantic"),
        "cosmetic_count": sum(1 for v in violations if v.severity == "cosmetic"),
        "violations": [
            {"rule": v.rule, "selector": v.selector, "severity": v.severity,
             "message": v.message, "fix": v.fix}
            for v in violations
        ],
    }
    print(json.dumps(report, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
