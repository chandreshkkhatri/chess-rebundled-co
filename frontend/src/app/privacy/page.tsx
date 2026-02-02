import { PageLayout } from '@/components/PageLayout';

export default function PrivacyPage() {
  return (
    <PageLayout>
      <div className="px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <p className="text-slate-400">
              Privacy Policy coming soon. We are committed to protecting your privacy and will
              publish our full policy here shortly.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
