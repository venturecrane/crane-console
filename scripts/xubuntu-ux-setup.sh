#!/bin/bash
#
# Xubuntu UX Improvements for Mac Users
# Makes Xubuntu feel more familiar to macOS users
#

set -e

echo "## Xubuntu UX Setup for Mac Users"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Install better terminal and utilities
echo -e "${BLUE}Step 1: Installing improved terminal and utilities${NC}"
echo ""
sudo apt update
sudo apt install -y \
    terminator \
    xfce4-clipman-plugin \
    xfce4-screenshooter \
    ulauncher \
    fonts-firacode \
    gnome-themes-extra \
    arc-theme \
    papirus-icon-theme
echo -e "${GREEN}✓ Utilities installed${NC}"
echo ""

# Step 2: Configure Terminator (better terminal)
echo -e "${BLUE}Step 2: Configuring Terminator terminal${NC}"
echo ""
mkdir -p "$HOME/.config/terminator"
cat > "$HOME/.config/terminator/config" << 'EOF'
[global_config]
  borderless = True
  tab_position = hidden
  enabled_plugins = LaunchpadBugURLHandler, LaunchpadCodeURLHandler, APTURLHandler
[keybindings]
  copy = <Primary>c
  paste = <Primary>v
  split_horiz = <Primary><Shift>d
  split_vert = <Primary>d
  close_term = <Primary>w
  new_tab = <Primary>t
  next_tab = <Primary>Tab
  prev_tab = <Primary><Shift>Tab
[profiles]
  [[default]]
    background_darkness = 0.95
    background_type = transparent
    cursor_color = "#aaaaaa"
    font = Fira Code 11
    use_system_font = False
    scrollback_infinite = True
    palette = "#073642:#dc322f:#859900:#b58900:#268bd2:#d33682:#2aa198:#eee8d5:#002b36:#cb4b16:#586e75:#657b83:#839496:#6c71c4:#93a1a1:#fdf6e3"
    foreground_color = "#839496"
    background_color = "#002b36"
EOF
echo -e "${GREEN}✓ Terminator configured (Solarized Dark theme)${NC}"
echo ""

# Step 3: Set Terminator as default terminal
echo -e "${BLUE}Step 3: Setting Terminator as default terminal${NC}"
echo ""
sudo update-alternatives --set x-terminal-emulator /usr/bin/terminator
echo -e "${GREEN}✓ Terminator set as default${NC}"
echo ""

# Step 4: Configure keyboard shortcuts (Mac-like)
echo -e "${BLUE}Step 4: Configuring Mac-like keyboard shortcuts${NC}"
echo ""
# Create keyboard shortcuts config
mkdir -p "$HOME/.config/xfce4/xfconf/xfce-perchannel-xml"

# This sets up Cmd-like behavior (using Super key)
cat > "$HOME/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-keyboard-shortcuts.xml" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-keyboard-shortcuts" version="1.0">
  <property name="commands" type="empty">
    <property name="custom" type="empty">
      <!-- Super+Space for app launcher (like Cmd+Space) -->
      <property name="&lt;Super&gt;space" type="string" value="ulauncher-toggle"/>
      <!-- Super+C for terminal (like Cmd+T in Terminal.app) -->
      <property name="&lt;Super&gt;t" type="string" value="terminator"/>
      <!-- Super+Q to close window (like Cmd+Q) -->
      <property name="&lt;Super&gt;q" type="string" value="xfce4-session-logout --logout"/>
      <!-- Super+W to close tab/window (like Cmd+W) -->
      <property name="&lt;Super&gt;w" type="string" value="close_window_key"/>
      <!-- Screenshot shortcuts (like Cmd+Shift+3/4) -->
      <property name="&lt;Super&gt;&lt;Shift&gt;3" type="string" value="xfce4-screenshooter -f"/>
      <property name="&lt;Super&gt;&lt;Shift&gt;4" type="string" value="xfce4-screenshooter -r"/>
    </property>
  </property>
  <property name="xfwm4" type="empty">
    <property name="custom" type="empty">
      <!-- Window management (Mac-like) -->
      <property name="&lt;Super&gt;Left" type="string" value="tile_left_key"/>
      <property name="&lt;Super&gt;Right" type="string" value="tile_right_key"/>
      <property name="&lt;Super&gt;Up" type="string" value="maximize_window_key"/>
      <property name="&lt;Super&gt;Down" type="string" value="hide_window_key"/>
      <!-- Workspace switching (like Mission Control) -->
      <property name="&lt;Control&gt;Left" type="string" value="left_workspace_key"/>
      <property name="&lt;Control&gt;Right" type="string" value="right_workspace_key"/>
    </property>
  </property>
</channel>
EOF
echo -e "${GREEN}✓ Keyboard shortcuts configured${NC}"
echo ""

# Step 5: Configure Ulauncher (Spotlight-like app launcher)
echo -e "${BLUE}Step 5: Configuring Ulauncher${NC}"
echo ""
# Start Ulauncher in background to generate config
ulauncher --no-window &
ULAUNCHER_PID=$!
sleep 3
kill $ULAUNCHER_PID 2>/dev/null || true

# Configure Ulauncher
mkdir -p "$HOME/.config/ulauncher"
cat > "$HOME/.config/ulauncher/settings.json" << 'EOF'
{
  "blacklisted-desktop-dirs": "/usr/share/locale:/usr/share/app-install:/usr/share/kservices5:/usr/share/fk5:/usr/share/kservicetypes5:/usr/share/applications/screensavers:/usr/share/kde4:/usr/share/mimelnk",
  "clear-input-on-hide": true,
  "hotkey-show-app": "<Super>space",
  "render-on-screen": "mouse-pointer-monitor",
  "show-indicator-icon": false,
  "show-recent-apps": "3",
  "terminal-command": "terminator -e '%s'",
  "theme-name": "dark"
}
EOF

# Set Ulauncher to start on login
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/ulauncher.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Exec=ulauncher --hide-window
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Ulauncher
Comment=Application launcher
EOF
echo -e "${GREEN}✓ Ulauncher configured (Super+Space to activate)${NC}"
echo ""

# Step 6: Apply Arc theme and Papirus icons
echo -e "${BLUE}Step 6: Applying Arc Dark theme${NC}"
echo ""
xfconf-query -c xsettings -p /Net/ThemeName -s "Arc-Dark"
xfconf-query -c xsettings -p /Net/IconThemeName -s "Papirus-Dark"
xfconf-query -c xfwm4 -p /general/theme -s "Arc-Dark"
echo -e "${GREEN}✓ Theme applied${NC}"
echo ""

# Step 7: Configure panel (dock-like)
echo -e "${BLUE}Step 7: Configuring panel${NC}"
echo ""
echo -e "${YELLOW}Panel configuration requires manual setup:${NC}"
echo "1. Right-click on panel → Panel → Panel Preferences"
echo "2. Set 'Mode' to 'Horizontal'"
echo "3. Set 'Row Size' to 48 pixels"
echo "4. Enable 'Automatically hide the panel'"
echo "5. Move panel to bottom of screen (drag it)"
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 8: Enable clipboard manager
echo -e "${BLUE}Step 8: Enabling clipboard manager${NC}"
echo ""
# Add to panel automatically would require complex xfconf manipulation
echo -e "${YELLOW}To add clipboard manager to panel:${NC}"
echo "1. Right-click panel → Panel → Add New Items"
echo "2. Find 'Clipman' and add it"
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 9: Configure window button layout (Mac-like)
echo -e "${BLUE}Step 9: Configuring window buttons (Mac-like)${NC}"
echo ""
xfconf-query -c xfwm4 -p /general/button_layout -s "close,minimize,maximize|"
echo -e "${GREEN}✓ Window buttons moved to left (Mac-style)${NC}"
echo ""

# Step 10: Install and configure fonts
echo -e "${BLUE}Step 10: Installing additional fonts${NC}"
echo ""
sudo apt install -y \
    fonts-liberation \
    fonts-noto \
    fonts-roboto \
    ttf-mscorefonts-installer
echo -e "${GREEN}✓ Fonts installed${NC}"
echo ""

# Step 11: Configure text editor (use gedit with Mac-like shortcuts)
echo -e "${BLUE}Step 11: Installing better text editor${NC}"
echo ""
sudo apt install -y gedit
# Set gedit as default text editor
xdg-mime default org.gnome.gedit.desktop text/plain
echo -e "${GREEN}✓ Gedit installed and set as default${NC}"
echo ""

# Step 12: Create useful aliases (Mac-like commands)
echo -e "${BLUE}Step 12: Adding Mac-like shell aliases${NC}"
echo ""
if ! grep -q "# Mac-like aliases" "$HOME/.bashrc"; then
    cat >> "$HOME/.bashrc" << 'EOF'

# Mac-like aliases
alias open='xdg-open'
alias pbcopy='xclip -selection clipboard'
alias pbpaste='xclip -selection clipboard -o'
alias chrome='google-chrome'

# Enhanced ls (Mac-like colors)
alias ls='ls --color=auto'
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
EOF
    echo -e "${GREEN}✓ Aliases added to .bashrc${NC}"
else
    echo -e "${YELLOW}Aliases already in .bashrc${NC}"
fi
echo ""

# Summary
echo "================================================"
echo -e "${GREEN}UX Setup Complete!${NC}"
echo "================================================"
echo ""
echo "What changed:"
echo ""
echo "✓ Terminator terminal (Solarized Dark theme)"
echo "✓ Ulauncher app launcher (Super+Space, like Spotlight)"
echo "✓ Arc Dark theme with Papirus icons"
echo "✓ Mac-like keyboard shortcuts:"
echo "  - Super+Space: App launcher"
echo "  - Super+T: Open terminal"
echo "  - Super+Shift+3: Screenshot (full screen)"
echo "  - Super+Shift+4: Screenshot (selection)"
echo "  - Super+Left/Right: Tile windows"
echo "  - Super+Up: Maximize window"
echo "✓ Window buttons on left (Mac-style)"
echo "✓ Mac-like shell commands: open, pbcopy, pbpaste"
echo ""
echo "Manual steps completed:"
echo "□ Panel configuration (dock-like)"
echo "□ Clipman added to panel"
echo ""
echo "Restart recommended to apply all changes:"
echo "   ${BLUE}sudo reboot${NC}"
echo ""
