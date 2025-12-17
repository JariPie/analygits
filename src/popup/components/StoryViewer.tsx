
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParsedStoryContent } from '../utils/sacParser';

interface StoryViewerProps {
    content: ParsedStoryContent;
    onRefresh: () => void;
}

const StoryViewer: React.FC<StoryViewerProps> = ({ content, onRefresh }) => {
    const { t } = useTranslation();

    // Accordion state
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const toggleSection = (section: string) => {
        if (expandedSection === section) {
            setExpandedSection(null);
        } else {
            setExpandedSection(section);
        }
    };

    const SectionHeader = ({ title, count, sectionKey }: { title: string, count: number, sectionKey: string }) => (
        <div
            className={`accordion-header ${expandedSection === sectionKey ? 'active' : ''}`}
            onClick={() => toggleSection(sectionKey)}
        >
            <div className="accordion-title">
                <span className="accordion-label">{title}</span>
                <span className="accordion-count">{count}</span>
            </div>
            <div className="accordion-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points={expandedSection === sectionKey ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}></polyline>
                </svg>
            </div>
        </div>
    );

    return (
        <div className="story-viewer-container card fade-in">
            {/* Header Area */}
            <div className="story-header">
                <div className="story-title-row">
                    <h1 className="story-title">{content.name || t('app.storyFetchedDefault')}</h1>
                    <button className="refresh-icon-btn" onClick={onRefresh} title={t('app.actions.refresh')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 4v6h-6"></path>
                            <path d="M1 20v-6h6"></path>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        </svg>
                    </button>
                </div>
                {content.description && <p className="story-description">{content.description}</p>}
                <div className="story-meta">
                    <span className="meta-badge">ID: {content.id}</span>
                </div>
            </div>

            <hr className="story-divider" />

            {/* Content Sections */}
            <div className="story-sections">

                {/* Pages */}
                <div className="accordion-item">
                    <SectionHeader
                        title={t('app.sections.pages', { count: content.pages.length }).replace('()', '').trim()}
                        count={content.pages.length}
                        sectionKey="pages"
                    />
                    {expandedSection === 'pages' && (
                        <div className="accordion-content">
                            {content.pages.length > 0 ? (
                                <ul className="details-list">
                                    {content.pages.map(page => (
                                        <li key={page.id} className="detail-item">
                                            <div className="detail-main">{page.title}</div>
                                            <div className="detail-sub">{page.id}</div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="empty-state">No pages found</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Global Variables */}
                <div className="accordion-item">
                    <SectionHeader
                        title={t('app.sections.globalVars', { count: content.globalVars.length }).replace('()', '').trim()}
                        count={content.globalVars.length}
                        sectionKey="globalVars"
                    />
                    {expandedSection === 'globalVars' && (
                        <div className="accordion-content">
                            {content.globalVars.length > 0 ? (
                                <ul className="details-list">
                                    {content.globalVars.map(gv => (
                                        <li key={gv.id} className="detail-item">
                                            <div className="detail-main">{gv.name}</div>
                                            <div className="detail-meta-row">
                                                <span className="type-badge">{gv.type}</span>
                                            </div>
                                            {gv.description && <div className="detail-sub">{gv.description}</div>}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="empty-state">No global variables found</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Script Objects */}
                <div className="accordion-item">
                    <SectionHeader
                        title={t('app.sections.scriptObjects', { count: content.scriptObjects.length }).replace('()', '').trim()}
                        count={content.scriptObjects.length}
                        sectionKey="scriptObjects"
                    />
                    {expandedSection === 'scriptObjects' && (
                        <div className="accordion-content">
                            {content.scriptObjects.length > 0 ? (
                                <ul className="details-list">
                                    {content.scriptObjects.map(so => (
                                        <li key={so.id} className="detail-item">
                                            <div className="detail-main">{so.name}</div>
                                            <div className="detail-sub">{so.functions.length} functions</div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="empty-state">No script objects found</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Events */}
                <div className="accordion-item">
                    <SectionHeader
                        title={t('app.sections.events', { count: content.events.length }).replace('()', '').trim()}
                        count={content.events.length}
                        sectionKey="events"
                    />
                    {expandedSection === 'events' && (
                        <div className="accordion-content">
                            {content.events.length > 0 ? (
                                <ul className="details-list">
                                    {content.events.map((evt, idx) => (
                                        <li key={evt.widgetId + idx} className="detail-item">
                                            <div className="detail-main">{evt.widgetName}</div>
                                            <div className="detail-sub">{evt.eventName}</div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="empty-state">No events found</div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default StoryViewer;
