export interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
    path: string;
}

export async function uploadFileToGitHub(
    config: GitHubConfig,
    content: string,
    message: string = "Update documentation from SAP Docs Tool"
): Promise<{ sha: string; url: string }> {
    const { token, owner, repo, path } = config;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // 1. Check if file exists to get SHA (needed for update)
    let sha: string | undefined;
    try {
        const existing = await fetch(apiUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });
        if (existing.ok) {
            const data = await existing.json();
            sha = data.sha;
        }
    } catch (e) {
        console.warn("Error checking for existing file:", e);
        // Continue, assuming new file
    }

    // 2. Create/Update file
    // Content must be base64 encoded
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const body: any = {
        message,
        content: encodedContent,
    };
    if (sha) {
        body.sha = sha;
    }

    const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GitHub API Error: ${errorData.message}`);
    }

    const result = await response.json();
    return { sha: result.content.sha, url: result.content.html_url };
}
