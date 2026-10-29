import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import heroImg from '@/assets/hero.png';
import hero1Img from '@/assets/hero1.png';

// Slides สำหรับ carousel — สามารถเพิ่มรูปได้ตามต้องการ
const slides = [
  {
    id: 1,
    image: heroImg,
    alt: 'Rmuti Market Banner',
    link: '/products',
    ctaText: 'เริ่มช้อปเลย',
  },
  {
    id: 2,
    image: hero1Img,
    alt: 'บรรยากาศ มทร.อีสาน',
    link: '/products',
    ctaText: 'ดูสินค้าใหม่',
  },
];

export function HeroBanner() {
  const [current, setCurrent] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % slides.length);
  }, []);

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
  }, []);

  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 45) {
      next(); // swipe left -> next slide
    } else if (diff < -45) {
      prev(); // swipe right -> prev slide
    }
  };

  // Auto-slide every 5 seconds
  useEffect(() => {
    const timer = setInterval(next, 10000);
    return () => clearInterval(timer);
  }, [next]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="relative overflow-hidden rounded-2xl shadow-md sm:shadow-lg w-full group touch-pan-y"
    >
      {/* Slides */}
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {slides.map((slide) => (
          <div key={slide.id} className="w-full shrink-0 relative h-[145px] sm:h-[240px] md:h-[320px] lg:h-[380px]">
            <img
              src={slide.image}
              alt={slide.alt}
              className="w-full h-full object-cover object-center block select-none pointer-events-none"
            />

            {/* CTA Button overlay */}
            <div className="absolute bottom-[6%] left-[6%] z-10">
              <Link
                to={slide.link}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-bold text-white shadow-lg hover:bg-brand-600 hover:shadow-xl transition-all active:scale-95"
                style={{ boxShadow: '0 4px 20px rgba(249,115,22,0.45)' }}
              >
                <span>{slide.ctaText}</span>
                <ChevronRight className="w-4 h-4 stroke-[3]" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-md hover:bg-white hover:text-brand-500 transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-md hover:bg-white hover:text-brand-500 transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Dot Indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrent(idx)}
              className={`rounded-full transition-all duration-300 ${
                idx === current
                  ? 'w-6 h-2.5 bg-brand-500'
                  : 'w-2.5 h-2.5 bg-white/70 hover:bg-white'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}