import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { listRepositories, type Repository } from '../services/github';
import CustomSelect from './CustomSelect';

interface RepoPickerProps {
    onRepoChange?: (repo: Repository | null) => void;
    onRefresh?: () => void;
}

const RepoPicker: React.FC<RepoPickerProps> = ({ onRepoChange, onRefresh }) => {
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

    const handleRepoChange = (value: string) => {
        if (!value) {
            selectRepo(null);
            onRepoChange?.(null);
            return;
        }

        const repo = repositories.find(r => r.full_name === value);
        if (repo) {
            selectRepo(repo);
            onRepoChange?.(repo);
        }
    };

    const handleBranchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBranch(e.target.value);
    };

    const repoOptions = repositories.map(repo => ({
        value: repo.full_name,
        label: `${repo.full_name}${repo.private ? ' 🔒' : ''}`
    }));

    if (status !== 'connected') {
        return null;
    }

    return (
        <div className="repo-picker">
            <div className="repo-picker-header">
                <span className="repo-picker-label">{t('repo.labels.repository')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            title={t('common.refresh') || 'Refresh'}
                            style={{
                                padding: '0',
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-light)',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-light)'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 4v6h-6"></path>
                                <path d="M1 20v-6h6"></path>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                        </button>
                    )}
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style={{ opacity: 0.7 }}>
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                    </svg>
                </div>
            </div>

            <div className="repo-picker-content">
                <div className="form-group">
                    {loading ? (
                        <div className="loading-spinner">{t('repo.status.loadingRepos')}</div>
                    ) : error ? (
                        <div className="error-message">{error}</div>
                    ) : (
                        <CustomSelect
                            value={selectedRepo?.full_name || ''}
                            onChange={handleRepoChange}
                            options={[{ value: '', label: t('repo.placeholders.selectRepo') }, ...repoOptions]}
                        />
                    )}
                </div>

                {selectedRepo && (
                    <div className="form-group" style={{ marginTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.25rem' }}>{t('repo.labels.branch')}</div>
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
        </div>
    );
};

export default RepoPicker;
