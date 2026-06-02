import { useEffect, useState } from 'react';

interface PreviewImageProps {
    src?: string;
    alt?: string;
    width?: string | number;
    height?: string | number;
}

const isRenderableImageSrc = (src: string) =>
    /^(data:image\/|https?:\/\/|blob:)/i.test(src);

const toLocalImagePath = (src: string) => {
    const decoded = decodeURI(src.trim()).replace(/^@/, '');
    if (decoded.startsWith('file://')) return decoded.replace(/^file:\/\//, '');
    if (decoded.startsWith('/')) return decoded;
    return null;
};

export function PreviewImage({
    src = '',
    alt = '',
    width,
    height,
}: PreviewImageProps) {
    const [resolvedImage, setResolvedImage] = useState({
        source: src,
        resolved: src,
    });
    const localPath = toLocalImagePath(src);
    const shouldResolveLocalImage =
        Boolean(localPath) && !isRenderableImageSrc(src);
    const displaySrc =
        shouldResolveLocalImage && resolvedImage.source === src
            ? resolvedImage.resolved
            : src;

    useEffect(() => {
        let cancelled = false;
        const localPath = toLocalImagePath(src);

        if (!localPath || isRenderableImageSrc(src)) return;

        const loadLocalImage = async () => {
            try {
                const dataUrl =
                    await window.electronAPI?.readLocalImageAsDataUrl(
                        localPath
                    );
                if (!cancelled)
                    setResolvedImage({ source: src, resolved: dataUrl ?? src });
            } catch {
                if (!cancelled)
                    setResolvedImage({ source: src, resolved: src });
            }
        };

        void loadLocalImage();

        return () => {
            cancelled = true;
        };
    }, [src]);

    return (
        <img
            className="previewImage"
            src={displaySrc}
            alt={alt}
            width={width}
            height={height}
            style={{
                maxWidth: '100%',
                width: width ? undefined : 'auto',
                height: height ? undefined : 'auto',
            }}
        />
    );
}
