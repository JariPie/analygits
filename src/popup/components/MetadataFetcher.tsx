import React from 'react';
import { useTranslation } from 'react-i18next';

interface MetadataFetcherProps {
    onFetch: (url: string, storyId?: string) => void;
    isLoading: boolean;
    url: string;
    storyId: string;
    onUrlChange: (url: string) => void;
    onStoryIdChange: (id: string) => void;
}

const MetadataFetcher: React.FC<MetadataFetcherProps> = ({
    onFetch,
    isLoading,
    url,
    storyId,
    onUrlChange,
    onStoryIdChange
}) => {
    const { t } = useTranslation();
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url) onFetch(url, storyId);
    };

    return (
        <div className="metadata-fetcher">
            <form onSubmit={handleSubmit} className="fetch-form">
                <div className="input-group">
                    <input
                        type="text"
                        placeholder={t('meta.placeholders.url')}
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        className="url-input"
                        disabled={isLoading}
                    />
                </div>
                <div className="input-group">
                    <input
                        type="text"
                        placeholder={t('meta.placeholders.storyId')}
                        value={storyId}
                        onChange={(e) => onStoryIdChange(e.target.value)}
                        className="url-input"
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading || !url} className="fetch-button">
                    {isLoading ? t('meta.actions.fetching') : t('meta.actions.fetch')}
                </button>
            </form>
        </div>
    );
};

export default MetadataFetcher;
