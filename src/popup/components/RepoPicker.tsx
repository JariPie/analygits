import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { listRepositories, type Repository } from '../services/githubService';

interface RepoPickerProps {
    onRepoChange?: (repo: Repository | null) => void;
}

const RepoPicker: React.FC<RepoPickerProps> = ({ onRepoChange }) => {
    const { t } = useTranslation();
    const { status, getAccessToken, selectedRepo, selectRepo, branch, setBranch } = useAuth();
    const [repositories, setRepositories] = useState<Repository[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status !== 'connected') return;

        console.log('🔄 RepoPicker: useEffect triggered', { status });

        const fetchRepos = async () => {
            console.log('🚀 RepoPicker: Fetching repos...');
            setLoading(true);
            setError(null);
            try {
                const token = await getAccessToken();
                const repos = await listRepositories(token);
                setRepositories(repos);
                console.log('✅ RepoPicker: Repos loaded', repos.length);
            } catch (err: any) {
                console.error('❌ RepoPicker: Fetch failed', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchRepos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]); // Depend only on status to avoid loop from getAccessToken recreation

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label htmlFor="repo-select" style={{ margin: 0 }}>{t('repo.labels.repository')}</label>
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style={{ opacity: 0.7 }}>
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                </div>
                {loading ? (
                    <div className="loading-spinner">{t('repo.status.loadingRepos')}</div>
                ) : error ? (
                    <div className="error-message">{error}</div>
                ) : (
                    <select
                        id="repo-select"
                        value={selectedRepo?.full_name || ''}
                        onChange={handleRepoChange}
                        className="repo-select"
                    >
                        <option value="">{t('repo.placeholders.selectRepo')}</option>
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
                    <label htmlFor="branch-input">{t('repo.labels.branch')}</label>
                    <input
                        id="branch-input"
                        type="text"
                        value={branch}
                        onChange={handleBranchChange}
                        placeholder={t('repo.placeholders.branch')}
                        className="branch-input"
                    />
                </div>
            )}
        </div>
    );
};

export default RepoPicker;
