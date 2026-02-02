import { Metadata } from 'next';
import { getAllPosts } from '@/lib/mdx';
import { PostCard } from '@/components/blog/PostCard';
import { PageLayout } from '@/components/PageLayout';

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
    <PageLayout>
      <div className="px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
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
      </div>
    </PageLayout>
  );
}
