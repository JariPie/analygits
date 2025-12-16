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
                <label htmlFor="repo-select">{t('repo.labels.repository')}</label>
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
