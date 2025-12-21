import React from 'react';
import { useTranslation } from 'react-i18next';
import './Button.css';

interface MetadataFetcherProps {
    onFetch: (url: string, storyId?: string) => void;
    isLoading: boolean;
    url: string;
    storyId: string;
    storyName?: string;
}

const MetadataFetcher: React.FC<MetadataFetcherProps> = ({
    onFetch,
    isLoading,
    url,
    storyId,
    storyName
}) => {
    const { t } = useTranslation();
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url) onFetch(url, storyId);
    };

    return (
        <div className="metadata-fetcher">
            <form onSubmit={handleSubmit} className="fetch-form">
                <button type="submit" disabled={isLoading || !url} className="fetch-button primary-button">
                    {isLoading
                        ? t('meta.actions.fetching')
                        : (storyName
                            ? t('meta.actions.fetchWithName', { name: storyName })
                            : t('meta.actions.fetch'))
                    }
                </button>
            </form>
        </div>
    );
};

export default MetadataFetcher;
