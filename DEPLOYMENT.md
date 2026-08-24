# HORA Deployment Guide

This guide walks you through deploying HORA to GitHub Pages so it's accessible at:
`https://tamiasdrahcir.github.io/hora/`

## Prerequisites

- GitHub account (https://github.com)
- Git installed on your computer
- The HORA application is already built and ready

## Step-by-Step Deployment

### Step 1: Create a New GitHub Repository

1. Go to https://github.com/new
2. Enter **`hora`** as the Repository name
3. Add description: "Homework Optimizer & Resource Allocator"
4. Choose visibility: Public (required for GitHub Pages)
5. Click **"Create repository"**

### Step 2: Add GitHub Remote and Push Code

Open terminal/PowerShell in the `hora` directory and run:

```bash
# Add GitHub repository as remote
git remote add origin https://github.com/tamiasdrahcir/hora.git

# Rename branch to main (if not already)
git branch -M main

# Push code to GitHub
git push -u origin main
```

**Note:** If you get a "repository already exists" error for the remote, use:
```bash
git remote set-url origin https://github.com/tamiasdrahcir/hora.git
```

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub: https://github.com/tamiasdrahcir/hora
2. Click **Settings** (gear icon)
3. Scroll down to **"Pages"** section (in left sidebar)
4. Under "Source":
   - Select: **"Deploy from a branch"**
   - Branch: **`gh-pages`**
   - Folder: **`/ (root)`**
5. Click **Save**

**Important:** GitHub Pages will look for a `gh-pages` branch which will be created by the deployment script.

### Step 4: Deploy to GitHub Pages

Run the deployment command:

```bash
npm run deploy
```

**What this command does:**
1. Builds the React application (`npm run build`)
2. Creates a `gh-pages` branch locally
3. Pushes the built files to the `gh-pages` branch on GitHub
4. GitHub automatically publishes the site

**Possible Issues:**

If you get a credentials error:
- Make sure you have git configured with your GitHub credentials
- Use Personal Access Token instead of password (GitHub deprecated password authentication)
- Or use SSH keys for authentication

To configure git credentials:
```bash
git config --global user.email "your.email@github.com"
git config --global user.name "Your Name"
```

### Step 5: Verify Deployment

1. Go to https://github.com/tamiasdrahcir/hora/settings/pages
2. You should see a message like:
   > "Your site is live at https://tamiasdrahcir.github.io/hora/"

3. Visit https://tamiasdrahcir.github.io/hora/ in your browser
4. The HORA application should be live!

**Note:** It may take a few minutes for the site to become available after first deployment.

## Continuous Deployment (Optional)

If you want automatic deployment on every push to main:

The GitHub Actions workflow is already configured in `.github/workflows/deploy.yml`

Just push your changes to the main branch and it will automatically deploy:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

The workflow will:
1. Automatically build your application
2. Deploy to GitHub Pages
3. Make the changes live within 1-2 minutes

## Updating the Website

### After making changes:

```bash
# Make your changes to the code

# Commit changes
git add .
git commit -m "Description of changes"

# Push to GitHub
git push origin main

# (Automatic deployment will run via GitHub Actions)
# OR manually deploy:
npm run deploy
```

## Troubleshooting

### "Repository not found" error
- Check that your remote URL is correct: `git remote -v`
- Make sure the repository exists on GitHub
- Verify you have access to the repository

### Site shows 404 or blank page
- Wait 1-2 minutes for deployment to complete
- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
- Check that GitHub Pages is enabled in repository settings
- Verify the `gh-pages` branch exists in your repository

### Changes not showing up
- Clear browser cache and hard refresh
- Check that your changes were pushed to main branch
- Verify the deployment completed in Actions tab

### Permission denied when deploying
- Ensure you have push access to the repository
- Check GitHub authentication is configured correctly
- Use a Personal Access Token if needed

## Project URLs

- **Repository**: https://github.com/tamiasdrahcir/hora
- **Live Site**: https://tamiasdrahcir.github.io/hora/
- **Local Development**: http://localhost:5173

## Additional Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to GitHub Pages
npm run deploy

# Check git status
git status

# View commit history
git log --oneline
```

## Local Storage

All user data is stored in browser's localStorage:
- Tasks and schedules
- Preferences and theme settings
- Completion status

Data is NOT synced to server, only stored locally.

To backup your data:
- Export from browser DevTools > Application > Local Storage
- Or manually save your configurations

## Support

If you encounter issues:

1. Check the GitHub Actions tab for deployment logs:
   https://github.com/tamiasdrahcir/hora/actions

2. Check GitHub Pages settings:
   https://github.com/tamiasdrahcir/hora/settings/pages

3. Review browser console for errors:
   - Open DevTools (F12)
   - Check Console tab for error messages

---

**You're all set!** Your HORA application is now live on GitHub Pages.

Start using it at: https://tamiasdrahcir.github.io/hora/
