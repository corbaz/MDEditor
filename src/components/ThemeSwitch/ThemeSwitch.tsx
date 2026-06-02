import type { Theme } from '../../types';

interface ThemeSwitchProps {
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
}

export function ThemeSwitch({ theme, onThemeChange }: ThemeSwitchProps) {
    return (
        <div
            className="themeSwitch segmentedSwitch"
            role="group"
            aria-label="Theme"
        >
            <button
                type="button"
                className={theme === 'light' ? 'active' : ''}
                onClick={() => onThemeChange('light')}
            >
                Light
            </button>
            <button
                type="button"
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => onThemeChange('dark')}
            >
                Dark
            </button>
        </div>
    );
}
