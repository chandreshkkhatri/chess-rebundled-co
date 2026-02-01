import Link from 'next/link';
import type { PostMeta } from '@/lib/mdx';

interface PostCardProps {
  post: PostMeta;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <article className="group p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-amber-500/50 transition-all duration-200 hover:bg-slate-800/80">
        <div className="flex flex-wrap gap-2 mb-3">
          {post.frontmatter.tags?.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400"
            >
              {tag}
            </span>
          ))}
        </div>
        <h2 className="text-xl font-semibold text-white group-hover:text-amber-400 transition-colors mb-2">
          {post.frontmatter.title}
        </h2>
        <p className="text-slate-400 text-sm mb-4 line-clamp-2">{post.frontmatter.excerpt}</p>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{post.frontmatter.author}</span>
          <div className="flex items-center gap-3">
            <span>{new Date(post.frontmatter.date).toLocaleDateString()}</span>
            <span>{post.readingTime}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
