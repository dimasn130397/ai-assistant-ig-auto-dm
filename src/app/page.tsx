'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { CreateAutomationInput, IgAutomation } from '@/types/automation';

const INITIAL_FORM: CreateAutomationInput = {
  keyword: '',
  target_url: '',
  comment_reply: 'Cek DM ya, link sudah dikirim ke pesan masuk kamu.',
  gate_message:
    'Follow akun ini terlebih dahulu untuk membuka akses link, lalu tekan tombol konfirmasi di bawah.',
  success_message: 'Terima kasih sudah follow. Silakan buka link melalui tombol di bawah:',
};

export default function DashboardPage() {
  const [automations, setAutomations] = useState<IgAutomation[]>([]);
  const [configured, setConfigured] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState<CreateAutomationInput>(INITIAL_FORM);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchAutomations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/automations', { cache: 'no-store' });
      const data = (await response.json()) as {
        configured?: boolean;
        automations?: IgAutomation[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Gagal memuat daftar automation.');
      }

      setConfigured(data.configured !== false);
      setAutomations(data.automations ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAutomations();
  }, [fetchAutomations]);

  const stats = useMemo(() => {
    const total = automations.length;
    const active = automations.filter((item) => item.is_active).length;
    const triggers = automations.reduce(
      (sum, item) => sum + (item.trigger_count ?? 0),
      0
    );
    return { total, active, triggers };
  }, [automations]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        automation?: IgAutomation;
        error?: string;
      };

      if (!response.ok || !data.automation) {
        throw new Error(data.error ?? 'Gagal menambahkan automation.');
      }

      setAutomations((prev) => [data.automation!, ...prev]);
      setForm({
        ...INITIAL_FORM,
        keyword: '',
        target_url: '',
      });
      setFeedback({
        type: 'success',
        message: `Keyword "${data.automation.keyword}" berhasil ditambahkan.`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal menyimpan automation.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleStatus(item: IgAutomation) {
    setFeedback(null);
    setBusyId(item.id);
    const nextState = !item.is_active;

    try {
      const response = await fetch(`/api/automations/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextState }),
      });

      const data = (await response.json()) as {
        automation?: IgAutomation;
        error?: string;
      };

      if (!response.ok || !data.automation) {
        throw new Error(data.error ?? 'Gagal mengubah status automation.');
      }

      setAutomations((prev) =>
        prev.map((row) => (row.id === item.id ? data.automation! : row))
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal memperbarui status.';
      setFeedback({ type: 'error', message });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setFeedback(null);
    setBusyId(id);

    try {
      const response = await fetch(`/api/automations/${id}`, {
        method: 'DELETE',
      });

      const data = (await response.json()) as {
        deleted?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Gagal menghapus automation.');
      }

      setAutomations((prev) => prev.filter((row) => row.id !== id));
      setConfirmDeleteId(null);
      setFeedback({
        type: 'success',
        message: 'Automation berhasil dihapus.',
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal menghapus automation.';
      setFeedback({ type: 'error', message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <h1 className="text-lg font-semibold tracking-tight text-zinc-50">
                Instagram Auto-DM &amp; Follower Gate
              </h1>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Automasi balasan komentar, Private Reply DM, dan verifikasi status follow melalui Meta Graph API v21.0.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400">
            <span className="text-zinc-500">Webhook</span>
            <code className="font-mono text-zinc-200">/api/webhook/instagram</code>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!configured && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <p className="font-medium text-amber-100">
              Konfigurasi Supabase belum terdeteksi
            </p>
            <p className="mt-1 text-xs text-amber-200/80">
              Lengkapi variabel lingkungan di <code className="font-mono">.env.local</code> dan jalankan skema SQL dari{' '}
              <code className="font-mono">supabase/schema.sql</code> sebelum menambahkan keyword.
            </p>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={`mb-6 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="ml-4 text-xs text-current opacity-70 transition hover:opacity-100"
            >
              Tutup
            </button>
          </div>
        )}

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Total Keyword
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
              {stats.total}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Automation Aktif
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-400">
              {stats.active}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Total Trigger
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
              {stats.triggers.toLocaleString('id-ID')}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <section className="lg:col-span-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="text-base font-semibold text-zinc-100">
                Tambah Keyword Baru
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Atur kata kunci komentar dan pesan otomatis untuk alur follower gate.
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="keyword"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Keyword
                  </label>
                  <input
                    id="keyword"
                    name="keyword"
                    type="text"
                    required
                    value={form.keyword}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, keyword: e.target.value }))
                    }
                    placeholder="Contoh: LINK, EBOOK, PROMO"
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="target_url"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Target URL
                  </label>
                  <input
                    id="target_url"
                    name="target_url"
                    type="url"
                    required
                    value={form.target_url}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, target_url: e.target.value }))
                    }
                    placeholder="https://domainanda.com/resource"
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="comment_reply"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Balasan Komentar Publik
                  </label>
                  <textarea
                    id="comment_reply"
                    name="comment_reply"
                    rows={2}
                    required
                    value={form.comment_reply}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        comment_reply: e.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="gate_message"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Pesan Follower Gate (DM)
                  </label>
                  <textarea
                    id="gate_message"
                    name="gate_message"
                    rows={3}
                    required
                    value={form.gate_message}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        gate_message: e.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="success_message"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Pesan Sukses Setelah Follow (DM)
                  </label>
                  <textarea
                    id="success_message"
                    name="success_message"
                    rows={2}
                    required
                    value={form.success_message}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        success_message: e.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !configured}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Automation'}
                </button>
              </form>
            </div>
          </section>

          <section className="lg:col-span-8">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">
                    Daftar Automation
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Kelola status aktif, pantau jumlah trigger, atau hapus rule yang tidak digunakan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchAutomations()}
                  disabled={isLoading}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-50"
                >
                  {isLoading ? 'Memuat...' : 'Refresh'}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-6 py-3.5 font-medium">Keyword &amp; Target</th>
                      <th className="px-6 py-3.5 font-medium">Pesan</th>
                      <th className="px-6 py-3.5 text-right font-medium">Trigger</th>
                      <th className="px-6 py-3.5 font-medium">Status</th>
                      <th className="px-6 py-3.5 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-12 text-center text-sm text-zinc-500"
                        >
                          Memuat daftar automation...
                        </td>
                      </tr>
                    ) : automations.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-12 text-center text-sm text-zinc-500"
                        >
                          Belum ada keyword automation. Tambahkan keyword pertama melalui form di samping.
                        </td>
                      </tr>
                    ) : (
                      automations.map((item) => {
                        const isBusy = busyId === item.id;
                        const isConfirming = confirmDeleteId === item.id;

                        return (
                          <tr
                            key={item.id}
                            className="transition-colors hover:bg-zinc-900/80"
                          >
                            <td className="px-6 py-4 align-top">
                              <span className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-0.5 font-mono text-xs font-medium text-zinc-100">
                                {item.keyword}
                              </span>
                              <div className="mt-1.5 max-w-[220px] truncate text-xs text-zinc-400">
                                <a
                                  href={item.target_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-emerald-400 hover:underline"
                                  title={item.target_url}
                                >
                                  {item.target_url}
                                </a>
                              </div>
                            </td>

                            <td className="max-w-[260px] px-6 py-4 align-top text-xs text-zinc-400">
                              <p className="truncate text-zinc-300" title={item.comment_reply}>
                                <span className="text-zinc-500">Reply:</span>{' '}
                                {item.comment_reply}
                              </p>
                              <p className="mt-1 truncate" title={item.gate_message}>
                                <span className="text-zinc-500">Gate:</span>{' '}
                                {item.gate_message}
                              </p>
                              <p className="mt-1 truncate" title={item.success_message}>
                                <span className="text-zinc-500">Sukses:</span>{' '}
                                {item.success_message}
                              </p>
                            </td>

                            <td className="px-6 py-4 text-right align-top font-mono text-sm tabular-nums text-zinc-200">
                              {item.trigger_count.toLocaleString('id-ID')}
                            </td>

                            <td className="px-6 py-4 align-top">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={item.is_active}
                                  aria-label={`Toggle status ${item.keyword}`}
                                  disabled={isBusy}
                                  onClick={() => void handleToggleStatus(item)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                                    item.is_active ? 'bg-emerald-600' : 'bg-zinc-700'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-150 ${
                                      item.is_active ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                                <span
                                  className={`text-xs font-medium ${
                                    item.is_active
                                      ? 'text-emerald-400'
                                      : 'text-zinc-500'
                                  }`}
                                >
                                  {item.is_active ? 'Aktif' : 'Nonaktif'}
                                </span>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-right align-top">
                              {isConfirming ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleDelete(item.id)}
                                    className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-50"
                                  >
                                    Ya, Hapus
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteId(item.id)}
                                  className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                                >
                                  Hapus
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
