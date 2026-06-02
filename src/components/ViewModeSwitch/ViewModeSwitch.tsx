import type { ViewMode } from '../../types';

interface ViewModeSwitchProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
}

export function ViewModeSwitch({ viewMode, onViewModeChange }: ViewModeSwitchProps) {
    return (
        <div
            className="modeSwitch segmentedSwitch"
            role="group"
            aria-label="View mode"
        >
            <button
                type="button"
                className={viewMode === 'editor' ? 'active' : ''}
                onClick={() => onViewModeChange('editor')}
            >
                Editor
            </button>
            <button
                type="button"
                className={viewMode === 'source' ? 'active' : ''}
                onClick={() => onViewModeChange('source')}
            >
                .md
            </button>
            <button
                type="button"
                className={viewMode === 'preview' ? 'active' : ''}
                onClick={() => onViewModeChange('preview')}
            >
                Preview
            </button>
        </div>
    );
}
