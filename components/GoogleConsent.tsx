"use client";

/** Fake "Sign in with Google" consent sheet for the mock connector. */
export function GoogleConsent({ onAllow, onCancel }: { onAllow: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="text-2xl font-medium">
          <span className="text-[#4285F4]">G</span>
          <span className="text-[#EA4335]">o</span>
          <span className="text-[#FBBC05]">o</span>
          <span className="text-[#4285F4]">g</span>
          <span className="text-[#34A853]">l</span>
          <span className="text-[#EA4335]">e</span>
        </div>
        <h2 className="mt-3 text-xl">Formly wants to access your Google Account</h2>
        <div className="mt-3 flex items-center gap-2 rounded-full border border-line px-2 py-1 text-sm w-fit">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#5b8def] text-xs text-white">A</span>
          alex.chen.dev@gmail.com
        </div>
        <p className="mt-4 text-sm font-medium">This will allow Formly to:</p>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          <li>• See your personal info, including birthday and phone</li>
          <li>• See your contacts</li>
          <li>• Read receipts and bills in Gmail</li>
          <li>• View files you choose in Google Drive</li>
        </ul>
        <p className="mt-4 text-xs text-muted">
          Formly keeps this data in your digital twin. Businesses only get the answers you approve.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-medium text-[#1a73e8] hover:bg-blue-50">
            Cancel
          </button>
          <button onClick={onAllow} className="rounded-full bg-[#1a73e8] px-5 py-2 text-sm font-medium text-white">
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
