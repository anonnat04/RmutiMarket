import { MapPin } from 'lucide-react';
import { meetupPoints } from '@/constants/meetupPoints';

export function MapPointPicker({ value, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl border border-surface-border">
        <img src="/images/campus-map.png" alt="แผนผัง มทร.อีสาน นครราชสีมา" className="block w-full" />
        {meetupPoints.map((point) => {
          const active = value === point.id;
          return (
            <button
              key={point.id}
              type="button"
              onClick={() => onChange(point.id)}
              title={point.name}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-full transition-transform hover:scale-110 ${
                active ? 'scale-110' : ''
              }`}
            >
              <MapPin
                size={28}
                className={active ? 'fill-brand-500 text-brand-700 drop-shadow' : 'fill-ink-900 text-white drop-shadow'}
                strokeWidth={1.5}
              />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {meetupPoints.map((point) => (
          <button
            key={point.id}
            type="button"
            onClick={() => onChange(point.id)}
            className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
              value === point.id
                ? 'border-brand-500 bg-brand-50'
                : 'border-surface-border bg-white hover:bg-surface-muted'
            }`}
          >
            <span className="text-sm font-semibold text-ink-900">{point.name}</span>
            <span className="text-xs text-ink-500">{point.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
