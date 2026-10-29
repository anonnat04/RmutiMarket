import { X, Check, ShieldCheck, ScrollText } from "lucide-react";

const TERMS_SECTIONS = [
  {
    num: 1,
    title: "คุณสมบัติผู้ใช้งาน",
    items: [
      "ต้องเป็นนักศึกษาหรือบุคลากรของมหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน และสมัครด้วยอีเมลโดเมน @rmuti.ac.th เท่านั้น",
      "ต้องผ่านการยืนยันตัวตนด้วยรหัส OTP และตรวจสอบรหัสประจำตัวนักศึกษาก่อนใช้งาน",
      "ห้ามสร้างบัญชีปลอม แอบอ้างตัวตนผู้อื่น หรือใช้บัญชีร่วมกับผู้อื่น",
    ],
  },
  {
    num: 2,
    title: "การลงประกาศขายสินค้า",
    items: [
      "สินค้าที่ลงประกาศต้องเป็นของถูกกฎหมาย ไม่ละเมิดลิขสิทธิ์ และไม่ผิดศีลธรรม",
      "ห้ามลงขายสินค้าต้องห้าม เช่น อาวุธ ของผิดกฎหมาย สารเสพติด เอกสารปลอม หรือสินค้าลอกเลียนแบบ",
      "ต้องระบุสภาพสินค้า ราคา และรูปภาพจริงตามความเป็นจริง ห้ามใช้รูปภาพหรือข้อมูลที่ทำให้ผู้ซื้อเข้าใจผิด",
      "ผู้ขายต้องรับผิดชอบต่อความถูกต้องของข้อมูลสินค้าที่ตนเองลงประกาศ",
    ],
  },
  {
    num: 3,
    title: "มารยาทในการสนทนาและติดต่อซื้อขาย",
    items: [
      "ห้ามใช้ถ้อยคำหยาบคาย คุกคาม หรือข่มขู่ผู้ใช้งานอื่นในห้องสนทนา",
      "ห้ามส่งข้อความหรือรูปภาพที่ไม่เหมาะสม ผิดกฎหมาย หรือสแปม",
      "การนัดหมายซื้อขายควรดำเนินการผ่านระบบนัดหมายของเว็บไซต์เพื่อความปลอดภัย",
    ],
  },
  {
    num: 4,
    title: "การนัดรับสินค้าและความปลอดภัย",
    items: [
      "แนะนำให้นัดพบซื้อขายที่จุดนัดรับปลอดภัย (Campus Safe Point) ที่ระบบกำหนดไว้เท่านั้น",
      "ผู้ใช้งานต้องยืนยันการส่งมอบ/ตรวจรับสินค้าให้ตรงกับความเป็นจริงทุกครั้ง",
      "การไม่มาตามนัดหมายโดยไม่แจ้งล่วงหน้า หรือยกเลิกนัดกะทันหัน จะถูกตัดคะแนนความน่าเชื่อถือ (Trust Score) ตามกฎบทลงโทษ",
    ],
  },
  {
    num: 5,
    title: "คะแนนความน่าเชื่อถือ (Trust Score)",
    items: [
      "ผู้ใช้ทุกคนเริ่มต้นด้วยคะแนน 100 คะแนน และจะถูกหักคะแนนหากมีพฤติกรรมผิดกฎ เช่น ไม่มาตามนัด หรือยกเลิกนัดกะทันหัน",
      "ผู้ใช้ที่มีคะแนนต่ำกว่า 50 คะแนน จะถูกจำกัดสิทธิ์ให้ดูและค้นหาสินค้าได้เท่านั้น ไม่สามารถซื้อ ขาย แชท หรือสร้างนัดหมายได้",
      "คะแนนสามารถฟื้นฟูได้จากการทำธุรกรรมสำเร็จและได้รับรีวิวเชิงบวกจากคู่ค้า",
    ],
  },
  {
    num: 6,
    title: "การให้คะแนนและรีวิว",
    items: [
      "ต้องให้คะแนนและรีวิวตามประสบการณ์จริงที่เกิดขึ้น ห้ามรีวิวเท็จ ปั่นคะแนน หรือใส่ร้ายผู้อื่นโดยไม่มีมูลความจริง",
      "ห้ามใช้หลายบัญชีเพื่อให้คะแนนตัวเองหรือพวกพ้อง",
    ],
  },
  {
    num: 7,
    title: "ข้อห้ามทั่วไป",
    items: [
      "ห้ามใช้ระบบเพื่อการหลอกลวง ฉ้อโกง หรือแสวงหาผลประโยชน์โดยมิชอบ",
      "ห้ามพยายามเจาะระบบ โจมตีความปลอดภัย หรือใช้ช่องโหว่ของเว็บไซต์ในทางที่ผิด",
      "ห้ามใช้บอทหรือโปรแกรมอัตโนมัติในการลงประกาศหรือทำธุรกรรมแทนมนุษย์",
    ],
  },
  {
    num: 8,
    title: "บทลงโทษและการดำเนินการของผู้ดูแลระบบ",
    items: [
      "ผู้ดูแลระบบมีสิทธิ์ตรวจสอบ ซ่อน หรือลบประกาศที่ผิดกฎ พร้อมแจ้งเหตุผลให้เจ้าของประกาศทราบ",
      "ผู้ดูแลระบบมีสิทธิ์ระงับสิทธิ์การใช้งาน (ชั่วคราวหรือถาวร) กับผู้ใช้ที่ฝ่าฝืนกฎอย่างร้ายแรงหรือซ้ำซาก",
      "การตัดสินของผู้ดูแลระบบถือเป็นที่สิ้นสุดในกรณีข้อพิพาทภายในแพลตฟอร์ม",
    ],
  },
  {
    num: 9,
    title: "ข้อจำกัดความรับผิดชอบ",
    items: [
      "เว็บไซต์เป็นเพียงตัวกลางในการติดต่อซื้อขายระหว่างผู้ใช้ ไม่รับผิดชอบต่อความเสียหายที่เกิดจากการซื้อขายนอกช่องทางที่ระบบกำหนด",
      "ผู้ใช้งานต้องใช้วิจารณญาณและตรวจสอบสินค้าด้วยตนเองก่อนตัดสินใจซื้อขาย",
    ],
  },
];

export function TermsModal({ open, onClose, onAccept }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#FFF9F5]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FBEEDF] text-[#E8631C]">
              <ScrollText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                กฎการใช้งานเว็บไซต์ RMUTI Market
              </h2>
              <p className="text-[12px] text-[#6B6B6B]">
                โปรดอ่านและทำความเข้าใจข้อตกลงเพื่อความปลอดภัยในการใช้งานร่วมกัน
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[13px] text-[#4A4A4A] leading-relaxed">
          {TERMS_SECTIONS.map((section) => (
            <div key={section.num} className="rounded-xl border border-gray-100 bg-[#FAF9F8] p-3.5 sm:p-4">
              <h3 className="font-bold text-[#E8631C] text-[13.5px] mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E8631C] text-white text-[11px] font-bold shrink-0">
                  {section.num}
                </span>
                {section.title}
              </h3>
              <ul className="space-y-1.5 pl-6 list-disc marker:text-[#E8631C]/60 text-[#3A3A3A]">
                {section.items.map((item, idx) => (
                  <li key={idx} className="leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-gray-100 bg-white">
          {onAccept ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  onAccept?.();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-[13px] font-bold text-white bg-[#E8631C] hover:bg-[#D35400] rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95"
              >
                <Check size={16} className="stroke-[3]" />
                ฉันได้อ่านและยอมรับกฎการใช้งาน
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center px-5 py-2 text-[13px] font-bold text-white bg-[#E8631C] hover:bg-[#D35400] rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95"
            >
              รับทราบ / ปิดหน้าต่าง
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
