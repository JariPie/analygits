import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type FileDiff } from '../services/github';
import './DiffViewer.css';

interface DiffViewerProps {
    diffs: FileDiff[];
    onFileSelect?: (paths: string[]) => void;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diffs, onFileSelect }) => {
    const { t } = useTranslation();
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set(diffs.map(d => d.path)));

    // Filter state: all true by default
    const [activeFilters, setActiveFilters] = useState({
        added: true,
        modified: true,
        deleted: true
    });

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

    const toggleFilter = (type: 'added' | 'modified' | 'deleted') => {
        setActiveFilters(prev => ({
            ...prev,
            [type]: !prev[type]
        }));
    };

    const getStatusIcon = (status: FileDiff['status']) => {
        switch (status) {
            case 'added': return <span className="diff-status-icon added">A</span>;
            case 'modified': return <span className="diff-status-icon modified">M</span>;
            case 'deleted': return <span className="diff-status-icon deleted">D</span>;
        }
    };

    const getStatusColor = (status: FileDiff['status']) => {
        switch (status) {
            case 'added': return '#22c55e'; // green-500
            case 'modified': return '#eab308'; // yellow-500
            case 'deleted': return '#ef4444'; // red-500
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
                        <div className="diff-section-header" style={{ color: '#ef4444' }}>{t('diff.labels.old')}</div>
                        <pre className="diff-old">{diff.oldContent}</pre>
                    </div>
                )}
                {diff.newContent && (
                    <div className="diff-section">
                        <div className="diff-section-header" style={{ color: '#22c55e' }}>{t('diff.labels.new')}</div>
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

    const filteredDiffs = diffs.filter(d => activeFilters[d.status]);

    return (
        <div className="diff-viewer">
            <div className="diff-filters">
                <button
                    className={`diff-filter-btn added ${activeFilters.added ? 'active' : ''}`}
                    onClick={() => toggleFilter('added')}
                >
                    {t('diff.stats.added', { count: diffs.filter(d => d.status === 'added').length })}
                </button>
                <button
                    className={`diff-filter-btn modified ${activeFilters.modified ? 'active' : ''}`}
                    onClick={() => toggleFilter('modified')}
                >
                    {t('diff.stats.modified', { count: diffs.filter(d => d.status === 'modified').length })}
                </button>
                <button
                    className={`diff-filter-btn deleted ${activeFilters.deleted ? 'active' : ''}`}
                    onClick={() => toggleFilter('deleted')}
                >
                    {t('diff.stats.deleted', { count: diffs.filter(d => d.status === 'deleted').length })}
                </button>
            </div>

            <div className="diff-list">
                {filteredDiffs.map(diff => (
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
                            <span
                                className="diff-path"
                                onClick={() => toggleExpand(diff.path)}
                                title={diff.path} // Native browser tooltip for full path
                            >
                                {diff.path}
                            </span>
                            <div
                                className="diff-expand-icon"
                                onClick={() => toggleExpand(diff.path)}
                                style={{
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '24px',
                                    height: '24px',
                                    color: '#94a3b8',
                                    transform: expandedPaths.has(diff.path) ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s'
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        </div>
                        {renderDiffContent(diff)}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DiffViewer;
