# SAP Analytics Cloud (SAC) Story Documentation Tool

A Chrome Extension for fetching SAP Analytics Cloud Stories, parsing their definitions, and saving documentation to GitHub.

## Features
- **Fetch SAC Stories**: Retrieves story definition JSON from SAP Analytics Cloud specific endpoints.
- **Parse Content**: Automatically finds and parses stringified JSON content within the story definition (`resource.cdata.content`).
- **Viewer**: Displays the formatted story definition structure.
- **GitHub Integration**: Save the documented story directly to a GitHub repository.

## Build Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build the Extension**
   ```bash
   npm run build
   ```
   The output is generated in the `dist` folder.

## How to Test & Use

### 1. Load in Chrome
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the `dist` folder in this project directory.

### 2. Login to SAP Analytics Cloud
Ensure you are logged into your SAP Analytics Cloud tenant in the same Chrome browser session. This extension relies on existing session cookies/SSO to make authorized requests.

### 3. Fetch a Story
1. Open the **SAP SAC Story Fetcher** extension.
2. Enter the **Tenant URL** (API endpoint).
   *   **Format**: `https://<TenantID>.<Region>.hcs.cloud.sap/sap/fpa/services/rest/epm/contentlib?tenant=<TenantNumber>`
3. Enter the **Story ID**.
   *   This is the 32-character ID (e.g., `83D8B609B5131732D3AF75C943EE712A`).
4. Click **Fetch Story**.
5. The extension will:
   *   Send a POST request with the required payload.
   *   Extract the nested `resource.cdata.content` JSON string.
   *   Parse it and display the Story Name, Description, and the full structured content JSON.

### 4. Save to GitHub
1. Scroll to the **GitHub Integration** section.
2. Enter your GitHub credentials:
   *   **PAT (Personal Access Token)**: Must have `repo` scope.
   *   **Owner**: Your GitHub username or organization.
   *   **Repo**: The repository name.
   *   **File Path**: Where to save the file (e.g., `docs/stories/my-story.md`).
3. Click **Save to GitHub**.
