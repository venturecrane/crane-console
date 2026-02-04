# Venture Templates

## Creating a New Venture

```bash
# Copy template to new location
cp -r ~/dev/crane-console/templates/venture ~/dev/new-venture-console
cd ~/dev/new-venture-console

# Initialize git
git init

# Update placeholders in README.md and CLAUDE.md
# - {Venture Name} → Your Venture Name
# - {Brief description} → Your description
# - etc.

# Install dependencies
npm install

# Create GitHub repo and push
gh repo create org/new-venture-console --private --source=.
git push -u origin main
```
