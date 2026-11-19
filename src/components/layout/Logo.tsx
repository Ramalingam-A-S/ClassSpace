import { Building2 } from 'lucide-react';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`inline-flex items-center justify-center rounded-lg bg-indigo-700 text-white ${
          size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
        }`}
      >
        <Building2 className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-base font-bold tracking-tight text-slate-900">ClassSpace</span>
        <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
          Campus Discovery
        </span>
      </span>
    </span>
  );
}
