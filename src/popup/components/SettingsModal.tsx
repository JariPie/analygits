import { useTranslation } from 'react-i18next';
import { useLanguagePreference, type LanguageOption } from '../hooks/useLanguagePreference';
import './SettingsModal.css'; // We'll assume we can add some specific styles or rely on global

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { t } = useTranslation();
    const { language, setLanguage } = useLanguagePreference();

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <header className="modal-header">
                    <h2>{t('settings.title')}</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </header>

                <div className="modal-body">
                    <div className="setting-item">
                        <label htmlFor="language-select">{t('settings.language.label')}</label>
                        <select
                            id="language-select"
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as LanguageOption)}
                            className="settings-select"
                        >
                            <option value="system">{t('settings.language.system')}</option>
                            <option value="en">{t('settings.language.en')}</option>
                            <option value="de">{t('settings.language.de')}</option>
                        </select>
                    </div>
                </div>

                <div className="modal-footer">
                    {/* Future: maybe a save button if we didn't auto-save, but hooks auto-save */}
                    <button className="primary-button small" onClick={onClose}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    );
}
