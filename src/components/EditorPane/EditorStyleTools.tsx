import { Highlighter, Palette } from 'lucide-react';
import type { Locale } from '../../lib/format';

type EditorStyleToolsProps = {
    locale: Locale;
    textColors: string[];
    highlightColors: string[];
    availableFonts: string[];
    selectedTextColor: string;
    selectedHighlightColor: string;
    selectedFont: string;
    onApplyTextColor: (color: string) => void;
    onApplyHighlight: (color: string) => void;
    onApplyFont: (font: string) => void;
    onRememberSelection: () => void;
};

export function EditorStyleTools({
    locale,
    textColors,
    highlightColors,
    availableFonts,
    selectedTextColor,
    selectedHighlightColor,
    selectedFont,
    onApplyTextColor,
    onApplyHighlight,
    onApplyFont,
    onRememberSelection,
}: EditorStyleToolsProps) {
    return (
        <div
            className="styleTools"
            onMouseDown={onRememberSelection}
        >
            <div
                className="styleToolGroup"
                title={
                    locale === 'es'
                        ? 'Color de texto'
                        : 'Text color'
                }
            >
                <Palette size={15} />
                {textColors.map((color) => (
                    <button
                        key={color}
                        type="button"
                        className="colorSwatch"
                        style={{
                            backgroundColor: color,
                        }}
                        aria-label={
                            locale === 'es'
                                ? 'Color de texto'
                                : 'Text color'
                        }
                        onMouseDown={(event) =>
                            event.preventDefault()
                        }
                        onClick={() => {
                            onApplyTextColor(color);
                        }}
                    />
                ))}
                <input
                    type="color"
                    value={selectedTextColor}
                    aria-label={
                        locale === 'es'
                            ? 'Elegir color de texto'
                            : 'Choose text color'
                    }
                    onChange={(event) => {
                        onApplyTextColor(event.target.value);
                    }}
                />
            </div>
            <div
                className="styleToolGroup"
                title={
                    locale === 'es'
                        ? 'Fondo resaltado'
                        : 'Highlight'
                }
            >
                <Highlighter size={15} />
                {highlightColors.map((color) => (
                    <button
                        key={color}
                        type="button"
                        className="colorSwatch"
                        style={{
                            backgroundColor: color,
                        }}
                        aria-label={
                            locale === 'es'
                                ? 'Fondo resaltado'
                                : 'Highlight'
                        }
                        onMouseDown={(event) =>
                            event.preventDefault()
                        }
                        onClick={() => {
                            onApplyHighlight(color);
                        }}
                    />
                ))}
                <input
                    type="color"
                    value={selectedHighlightColor}
                    aria-label={
                        locale === 'es'
                            ? 'Elegir fondo resaltado'
                            : 'Choose highlight'
                    }
                    onChange={(event) => {
                        onApplyHighlight(event.target.value);
                    }}
                />
            </div>
            <select
                className="fontSelect"
                value={selectedFont}
                title={
                    locale === 'es'
                        ? 'Fuente'
                        : 'Font'
                }
                aria-label={
                    locale === 'es'
                        ? 'Fuente'
                        : 'Font'
                }
                onMouseDown={onRememberSelection}
                onChange={(event) => {
                    onApplyFont(event.target.value);
                }}
            >
                {availableFonts.map((font) => (
                    <option
                        key={font}
                        value={font}
                    >
                        {font}
                    </option>
                ))}
            </select>
        </div>
    );
}
