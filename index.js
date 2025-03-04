const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));

// Serve static assets (Bootstrap CSS, etc.) if needed
app.use(express.static('public'));

// Environment variables
const GITHUB_PAT = process.env.GITHUB_PAT;
const GITHUB_ORG = process.env.GITHUB_ORG || 'EpisourceLLC';
const GITHUB_API_BASE = 'https://api.github.com';

// Route: Welcome page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'welcome.html'));
});

// Route: Form page
app.get('/form', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'form.html'));
});

// Route: Handle form submission and create repository
app.post('/create', async (req, res) => {
  // Extract form fields
  const {
    projectName,
    projectDescription,
    visibility,
    projectType,
    deployPyModule,
    dockerfileContent,
    omitDockerfile,
    addGateway
  } = req.body;

  // Determine repository privacy
  const isPrivate = (visibility === 'private');

  try {
    // 1. Create the repository under the organization
    const repoResponse = await axios.post(
      `${GITHUB_API_BASE}/orgs/${GITHUB_ORG}/repos`,
      {
        name: projectName,
        description: projectDescription,
        private: isPrivate
      },
      {
        headers: {
          Authorization: `token ${GITHUB_PAT}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );
    const repoUrl = repoResponse.data.html_url;

    // 2. Determine which workflow template to use based on projectType
    let workflowTemplatePath = '';
    if (projectType === 'Python App') {
      workflowTemplatePath = path.join(__dirname, 'templates', 'python_app.yaml');
    } else if (projectType === 'Python Module') {
      workflowTemplatePath = path.join(__dirname, 'templates', 'python_module.yaml');
    } else if (projectType === 'NodeJS UI') {
      workflowTemplatePath = path.join(__dirname, 'templates', 'nodejs_ui.yaml');
    } else {
      // Fallback o default
      workflowTemplatePath = path.join(__dirname, 'templates', 'default.yaml');
    }

    let workflowContent = fs.readFileSync(workflowTemplatePath, 'utf8');
    // Example: Replace variables in the template
    workflowContent = workflowContent.replace(/{{projectName}}/g, projectName);
    // 3. If Dockerfile creation is not omitted, create the workflow file in the repo
    if (!omitDockerfile) {
        const fileContentBase64 = Buffer.from(workflowContent).toString('base64');
        // Create file via GitHub API: PUT /repos/:owner/:repo/contents/:path
        await axios.put(
          `${GITHUB_API_BASE}/repos/${GITHUB_ORG}/${projectName}/contents/.github/workflows/develop.yaml`,
          {
            message: 'Add develop workflow',
            content: fileContentBase64,
            branch: 'develop'
          },
          {
            headers: {
              Authorization: `token ${GITHUB_PAT}`,
              Accept: 'application/vnd.github.v3+json'
            }
          }
        );
    }

    // 4. (Optional) Set the default branch to "develop"
    // GitHub API creates the repository with "main" por defecto, 
    // así que podemos actualizarlo usando PATCH:
    await axios.patch(
      `${GITHUB_API_BASE}/repos/${GITHUB_ORG}/${projectName}`,
      { default_branch: 'develop' },
      {
        headers: {
          Authorization: `token ${GITHUB_PAT}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    
    
    // 5. (Optional) You can also add additional configuration, e.g. for setting up a gateway, if required

    // Render a simple success page with repository details
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Repository Created</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5/dist/css/bootstrap.min.css">
      </head>
      <body class="container">
        <h1 class="mt-4">Repository Created Successfully</h1>
        <p><strong>Repository URL:</strong> <a href="${repoUrl}" target="_blank">${repoUrl}</a></p>
        <p><strong>Project Type:</strong> ${projectType}</p>
        <p><strong>Deploy Python Module:</strong> ${deployPyModule ? 'Yes' : 'No'}</p>
        <p><strong>Add Gateway:</strong> ${addGateway ? 'Yes' : 'No'}</p>
        <a class="btn btn-primary" href="/welcome">Back Home</a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
    res.status(500).send(
      `<h1>Error creating repository</h1><p>${err.response ? JSON.stringify(err.response.data) : err.message}</p>`
    );
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GitHub Repository Creator app running on port ${PORT}`);
});
