import { useEffect, useState } from 'react';

export default function Modal({ data, onClose }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => onClose(), 260);
  };

  if (!data) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-colors duration-300 ${
        isOpen ? 'bg-[rgba(0,0,0,0.62)]' : 'bg-[rgba(0,0,0,0)]'
      }`}
      onClick={handleClose}
    >
      <div
        className={`relative w-[90%] max-w-lg max-h-full overflow-y-auto overflow-x-hidden rounded-2xl border border-white/30 bg-white/95 p-6 shadow-2xl backdrop-blur-md transition-all duration-300 ${
          isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="absolute top-3 right-3 text-xl text-gray-500 hover:text-black" onClick={handleClose}>
          ✕
        </button>

        <h2 className="text-xl font-bold mb-3">{data.title}</h2>

        {data.image && <img src={data.image} className="mb-3 rounded w-full" />}

        <p className="mb-3">{data.description}</p>

        {data.video && <iframe width="100%" height="250" src={data.video} allowFullScreen />}

        {data.link && (
          <a href={data.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline mt-3 block">
            🔗 View Project
          </a>
        )}
      </div>
    </div>
  );
}
