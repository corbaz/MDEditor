import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { PreviewImage } from './PreviewImage';

interface PreviewContentProps {
    markdown: string;
}

export function PreviewContent({ markdown }: PreviewContentProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            urlTransform={(url) => url}
            components={{
                img: ({ src = '', alt = '', width, height }) => (
                    <PreviewImage
                        src={src}
                        alt={alt}
                        width={width}
                        height={height}
                    />
                ),
            }}
        >
            {markdown}
        </ReactMarkdown>
    );
}
