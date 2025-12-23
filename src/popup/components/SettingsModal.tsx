import CustomSelect from './CustomSelect';
import { useTranslation } from 'react-i18next';
import { type LanguageOption } from '../hooks/useLanguagePreference';
import './SettingsModal.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentLanguage: LanguageOption;
    onLanguageChange: (lang: LanguageOption) => void;
}

export default function SettingsModal({ isOpen, onClose, currentLanguage, onLanguageChange }: SettingsModalProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    const languageOptions = [
        { value: 'system', label: t('settings.language.system') },
        { value: 'en', label: t('settings.language.en') },
        { value: 'de', label: t('settings.language.de') },
    ];

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
                        <CustomSelect
                            value={currentLanguage}
                            onChange={(val) => onLanguageChange(val as LanguageOption)}
                            options={languageOptions}
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="primary-button small" onClick={onClose}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    );
}
