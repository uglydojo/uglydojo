# Deploy Workflow — Q63 Tracker

Hosted on Cloudflare Pages. Any push to `main` auto-deploys to production.
Non-main branches get preview URLs automatically.

## Ship an Update

### 1. Branch + Build
```bash
git checkout -b update/short-description
# Make changes...
# Bump APP_VERSION in Q63_Tracker.html
# Add entry to CHANGELOG.md
git add -A && git commit -m "v2.X — description"
```

### 2. Preview
```bash
git push -u origin update/short-description
```
- Cloudflare generates a preview URL automatically (check Pages dashboard)
- Test on mobile — logo sizing, layout, practice toggles
- Test auth flow — login, register, reset password screens

### 3. Ship
```bash
git checkout main && git merge update/short-description
git push origin main
git tag v2.X && git push --tags
```

### 4. Verify
- Check production URL loads correctly
- Confirm version number in app settings
- Test OG tags with social media debugger if meta tags changed

## Rollback
```bash
git revert HEAD && git push origin main
```

## File Structure
```
uglydojo/
  Q63_Tracker.html    ← the entire app (single file)
  assets/
    logo.png          ← full-size logo (OG image)
    apple-touch-icon.png  ← 180x180
    favicon.png       ← 32x32
  CHANGELOG.md
  DEPLOY.md
```
