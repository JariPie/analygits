import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type FileDiff } from '../services/githubService';

interface DiffViewerProps {
    diffs: FileDiff[];
    onFileSelect?: (paths: string[]) => void;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diffs, onFileSelect }) => {
    const { t } = useTranslation();
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set(diffs.map(d => d.path)));

    const toggleExpand = (path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const toggleSelect = (path: string) => {
        setSelectedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            onFileSelect?.(Array.from(next));
            return next;
        });
    };

    const getStatusIcon = (status: FileDiff['status']) => {
        switch (status) {
            case 'added': return <span className="diff-status diff-added">A</span>;
            case 'modified': return <span className="diff-status diff-modified">M</span>;
            case 'deleted': return <span className="diff-status diff-deleted">D</span>;
        }
    };

    const getStatusColor = (status: FileDiff['status']) => {
        switch (status) {
            case 'added': return '#28a745';
            case 'modified': return '#ffc107';
            case 'deleted': return '#dc3545';
        }
    };

    const renderDiffContent = (diff: FileDiff) => {
        if (!expandedPaths.has(diff.path)) return null;

        if (diff.status === 'deleted') {
            return (
                <div className="diff-content deleted-content">
                    <pre>{diff.oldContent || t('diff.contentNotLoaded')}</pre>
                </div>
            );
        }

        if (diff.status === 'added') {
            return (
                <div className="diff-content added-content">
                    <pre>{diff.newContent}</pre>
                </div>
            );
        }

        // Modified: show unified diff
        return (
            <div className="diff-content">
                {diff.oldContent && (
                    <div className="diff-section">
                        <div className="diff-section-header" style={{ color: '#dc3545' }}>{t('diff.labels.old')}</div>
                        <pre className="diff-old">{diff.oldContent}</pre>
                    </div>
                )}
                {diff.newContent && (
                    <div className="diff-section">
                        <div className="diff-section-header" style={{ color: '#28a745' }}>{t('diff.labels.new')}</div>
                        <pre className="diff-new">{diff.newContent}</pre>
                    </div>
                )}
            </div>
        );
    };

    if (diffs.length === 0) {
        return (
            <div className="diff-viewer empty">
                <p>{t('diff.noChanges')}</p>
            </div>
        );
    }

    return (
        <div className="diff-viewer">
            <div className="diff-summary">
                <span className="diff-count added">{t('diff.stats.added', { count: diffs.filter(d => d.status === 'added').length })}</span>
                <span className="diff-count modified">{t('diff.stats.modified', { count: diffs.filter(d => d.status === 'modified').length })}</span>
                <span className="diff-count deleted">{t('diff.stats.deleted', { count: diffs.filter(d => d.status === 'deleted').length })}</span>
            </div>

            <div className="diff-list">
                {diffs.map(diff => (
                    <div key={diff.path} className="diff-item" style={{ borderLeft: `3px solid ${getStatusColor(diff.status)}` }}>
                        <div className="diff-item-header">
                            <label className="diff-checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={selectedPaths.has(diff.path)}
                                    onChange={() => toggleSelect(diff.path)}
                                />
                            </label>
                            {getStatusIcon(diff.status)}
                            <span className="diff-path" onClick={() => toggleExpand(diff.path)}>
                                {diff.path}
                            </span>
                            <button
                                className="diff-expand-btn"
                                onClick={() => toggleExpand(diff.path)}
                                aria-label={expandedPaths.has(diff.path) ? t('diff.actions.collapse') : t('diff.actions.expand')}
                            >
                                {expandedPaths.has(diff.path) ? '▼' : '▶'}
                            </button>
                        </div>
                        {renderDiffContent(diff)}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DiffViewer;
