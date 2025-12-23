
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParsedStoryContent, WidgetEvent, ScriptObject, ScriptObjectFunction } from '../utils/sacParser';
import './Accordion.css';

const CodePreview = ({ code }: { code: string }) => (
    <pre className="code-preview">
        <code>{code}</code>
    </pre>
);

const ExpandableItem = ({ title, subtitle, children, onToggle }: { title: React.ReactNode, subtitle?: React.ReactNode, children?: React.ReactNode, onToggle?: () => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = !!children;

    const handleClick = () => {
        if (hasChildren) {
            setIsOpen(!isOpen);
            if (onToggle) onToggle();
        }
    };

    return (
        <li className={`detail-item ${hasChildren ? 'expandable' : ''}`}>
            <div className="detail-header" onClick={handleClick} style={{ cursor: hasChildren ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                    <div className="detail-main" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {title}
                    </div>
                    {subtitle && <div className="detail-sub">{subtitle}</div>}
                </div>
                {hasChildren && (
                    <div className={`accordion-icon ${isOpen ? 'rotated' : ''}`} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#94a3b8' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                )}
            </div>
            {isOpen && children && (
                <div className="detail-content" style={{ marginTop: '0.5rem' }}>
                    {children}
                </div>
            )}
        </li>
    );
};

const EventItem = ({ event }: { event: WidgetEvent }) => {
    return (
        <ExpandableItem
            title={event.widgetName}
            subtitle={event.eventName}
        >
            {event.body && <CodePreview code={event.body} />}
        </ExpandableItem>
    );
};

const ScriptFunctionItem = ({ func }: { func: ScriptObjectFunction }) => {
    const args = func.arguments ? `(${func.arguments.join(', ')})` : '()';
    return (
        <ExpandableItem
            title={<span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{func.name}{args}</span>}
        >
            {func.body && <CodePreview code={func.body} />}
        </ExpandableItem>
    );
}

const ScriptObjectItem = ({ scriptObject }: { scriptObject: ScriptObject }) => {
    return (
        <ExpandableItem
            title={scriptObject.name}
            subtitle={`${scriptObject.functions.length} functions`}
        >
            {scriptObject.functions.length > 0 && (
                <ul className="details-list nested">
                    {scriptObject.functions.map((func, idx) => (
                        <ScriptFunctionItem key={func.name + idx} func={func} />
                    ))}
                </ul>
            )}
        </ExpandableItem>
    )
}

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
            <div className="accordion-icon" style={{ transform: expandedSection === sectionKey ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#94a3b8' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
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
                {content.pages.length > 0 && (
                    <div className="accordion-item">
                        <SectionHeader
                            title={t('app.sections.pages', { count: content.pages.length }).replace('()', '').trim()}
                            count={content.pages.length}
                            sectionKey="pages"
                        />
                        {expandedSection === 'pages' && (
                            <div className="accordion-content">
                                <ul className="details-list">
                                    {content.pages.map(page => (
                                        <li key={page.id} className="detail-item">
                                            <div className="detail-main">{page.title}</div>
                                            <div className="detail-sub">{page.id}</div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Global Variables */}
                {content.globalVars.length > 0 && (
                    <div className="accordion-item">
                        <SectionHeader
                            title={t('app.sections.globalVars', { count: content.globalVars.length }).replace('()', '').trim()}
                            count={content.globalVars.length}
                            sectionKey="globalVars"
                        />
                        {expandedSection === 'globalVars' && (
                            <div className="accordion-content">
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
                            </div>
                        )}
                    </div>
                )}

                {/* Script Objects */}
                {content.scriptObjects.length > 0 && (
                    <div className="accordion-item">
                        <SectionHeader
                            title={t('app.sections.scriptObjects', { count: content.scriptObjects.length }).replace('()', '').trim()}
                            count={content.scriptObjects.length}
                            sectionKey="scriptObjects"
                        />
                        {expandedSection === 'scriptObjects' && (
                            <div className="accordion-content">
                                <ul className="details-list">
                                    {content.scriptObjects.map(so => (
                                        <ScriptObjectItem key={so.id} scriptObject={so} />
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Events */}
                {content.events.length > 0 && (
                    <div className="accordion-item">
                        <SectionHeader
                            title={t('app.sections.events', { count: content.events.length }).replace('()', '').trim()}
                            count={content.events.length}
                            sectionKey="events"
                        />
                        {expandedSection === 'events' && (
                            <div className="accordion-content">
                                <ul className="details-list">
                                    {content.events.map((evt, idx) => (
                                        <EventItem key={evt.widgetId + idx} event={evt} />
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};

export default StoryViewer;
