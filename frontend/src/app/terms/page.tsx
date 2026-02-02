import { PageLayout } from '@/components/PageLayout';

export default function TermsPage() {
  return (
    <PageLayout>
      <div className="px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1>
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <p className="text-slate-400">
              Terms of Service coming soon. We will publish our full terms here shortly.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
