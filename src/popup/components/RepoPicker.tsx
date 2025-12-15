import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listRepositories, type Repository } from '../services/githubService';

interface RepoPickerProps {
    onRepoChange?: (repo: Repository | null) => void;
}

const RepoPicker: React.FC<RepoPickerProps> = ({ onRepoChange }) => {
    const { status, getAccessToken, selectedRepo, selectRepo, branch, setBranch } = useAuth();
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status !== 'connected') return;

        const fetchRepos = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = await getAccessToken();
                const repos = await listRepositories(token);
                setRepositories(repos);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchRepos();
    }, [status, getAccessToken]);

    const handleRepoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const repoFullName = e.target.value;
        if (!repoFullName) {
            selectRepo(null);
            onRepoChange?.(null);
            return;
        }

        const repo = repositories.find(r => r.full_name === repoFullName);
        if (repo) {
            selectRepo(repo);
            onRepoChange?.(repo);
        }
    };

    const handleBranchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBranch(e.target.value);
    };

    if (status !== 'connected') {
        return null;
    }

    return (
        <div className="repo-picker">
            <div className="form-group">
                <label htmlFor="repo-select">Repository</label>
                {loading ? (
                    <div className="loading-spinner">Loading repositories...</div>
                ) : error ? (
                    <div className="error-message">{error}</div>
                ) : (
                    <select
                        id="repo-select"
                        value={selectedRepo?.full_name || ''}
                        onChange={handleRepoChange}
                        className="repo-select"
                    >
                        <option value="">Select a repository...</option>
                        {repositories.map(repo => (
                            <option key={repo.id} value={repo.full_name}>
                                {repo.full_name} {repo.private ? '🔒' : ''}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {selectedRepo && (
                <div className="form-group">
                    <label htmlFor="branch-input">Branch</label>
                    <input
                        id="branch-input"
                        type="text"
                        value={branch}
                        onChange={handleBranchChange}
                        placeholder="main"
                        className="branch-input"
                    />
                </div>
            )}
        </div>
    );
};

export default RepoPicker;
