
import React, { useState, useEffect } from 'react';
import { type GitHubConfig, uploadFileToGitHub } from '../utils/github';

interface GitHubIntegrationProps {
    contentGenerator?: () => string;
    defaultPath?: string;
}

const GitHubIntegration: React.FC<GitHubIntegrationProps> = ({ contentGenerator, defaultPath = "documentation.html" }) => {
    const [config, setConfig] = useState<GitHubConfig>({
        token: '',
        owner: '',
        repo: '',
        path: defaultPath // Use defaultPath prop
    });
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        // Load saved config
        chrome.storage.local.get(['githubConfig'], (result) => {
            if (result.githubConfig) {
                setConfig(result.githubConfig as GitHubConfig);
            }
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        setStatus('uploading');
        setMessage('');

        const contentToSave = contentGenerator ? contentGenerator() : '';
        if (!contentToSave) {
            setStatus('error');
            setMessage('No content to save.');
            return;
        }

        // Save config for later
        chrome.storage.local.set({ githubConfig: config });

        try {
            const result: any = await uploadFileToGitHub(config, contentToSave);
            setStatus('success');
            setMessage(`Saved to ${result.url}`);
        } catch (e: any) {
            setStatus('error');
            setMessage(e.message);
        }
    };

    return (
        <div className="card github-integration">
            <div className="card-header">
                <h2>GitHub Integration</h2>
            </div>
            <div className="form-group">
                <label>GitHub PAT (Repo Scope)</label>
                <input
                    type="password"
                    name="token"
                    value={config.token}
                    onChange={handleChange}
                    placeholder="ghp_..."
                />
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Owner</label>
                    <input
                        type="text"
                        name="owner"
                        value={config.owner}
                        onChange={handleChange}
                        placeholder="username"
                    />
                </div>
                <div className="form-group">
                    <label>Repo</label>
                    <input
                        type="text"
                        name="repo"
                        value={config.repo}
                        onChange={handleChange}
                        placeholder="repository"
                    />
                </div>
            </div>
            <div className="form-group">
                <label>File Path</label>
                <input
                    type="text"
                    name="path"
                    value={config.path}
                    onChange={handleChange}
                    placeholder="docs/story.md"
                />
            </div>

            <button
                onClick={handleSave}
                disabled={status === 'uploading' || !config.token || !contentGenerator}
                className="secondary-button"
            >
                {status === 'uploading' ? 'Saving...' : 'Save to GitHub'}
            </button>

            {message && (
                <div className={`status-message ${status}`}>
                    {message}
                </div>
            )}
        </div>
    );
};

export default GitHubIntegration;
