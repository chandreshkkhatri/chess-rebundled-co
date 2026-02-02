import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getPost, getAllPostSlugs } from '@/lib/mdx';
import { mdxComponents } from '@/components/blog/MDXComponents';
import { PageLayout } from '@/components/PageLayout';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: 'Post Not Found' };
  }

  return {
    title: `${post.frontmatter.title} | Chess Rebundled Blog`,
    description: post.frontmatter.excerpt,
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.excerpt,
      type: 'article',
      publishedTime: post.frontmatter.date,
      authors: [post.frontmatter.author],
      images: post.frontmatter.ogImage ? [post.frontmatter.ogImage] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.frontmatter.title,
      description: post.frontmatter.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <PageLayout>
      <div className="px-4 py-8">
        <article className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center text-slate-400 hover:text-white transition-colors mb-8"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to blog
          </Link>

          {/* Post header */}
          <header className="mb-8">
            <div className="flex flex-wrap gap-2 mb-4">
              {post.frontmatter.tags?.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400"
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">{post.frontmatter.title}</h1>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>{post.frontmatter.author}</span>
              <span>|</span>
              <span>{new Date(post.frontmatter.date).toLocaleDateString()}</span>
              <span>|</span>
              <span>{post.readingTime}</span>
            </div>
          </header>

          {/* Post content */}
          <div className="prose prose-invert max-w-none">
            <MDXRemote source={post.content} components={mdxComponents} />
          </div>

          {/* Footer */}
          <footer className="mt-12 pt-8 border-t border-slate-700">
            <Link
              href="/blog"
              className="inline-flex items-center text-amber-400 hover:text-amber-300 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Read more articles
            </Link>
          </footer>
        </article>
      </div>
    </PageLayout>
  );
}
