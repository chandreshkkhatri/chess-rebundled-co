import { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/mdx';
import { PostCard } from '@/components/blog/PostCard';

export const metadata: Metadata = {
  title: 'Blog | Chess Rebundled',
  description: 'Articles about chess, learning strategies, and mastering chess notation',
  openGraph: {
    title: 'Blog | Chess Rebundled',
    description: 'Articles about chess, learning strategies, and mastering chess notation',
    type: 'website',
  },
};

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <main className="min-h-screen pt-8 px-4 pb-16">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-slate-400 hover:text-white transition-colors mb-6"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to app
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">Blog</h1>
          <p className="text-slate-400">
            Tips, strategies, and insights for mastering chess notation
          </p>
        </div>

        {/* Posts grid */}
        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-400">No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
