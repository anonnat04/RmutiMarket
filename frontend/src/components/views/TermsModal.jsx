import { X, Check, ScrollText } from "lucide-react";

const TERMS_SECTIONS = [
  {
    num: 1,
    title: "คุณสมบัติผู้ใช้งาน",
    items: [
      "ต้องเป็นนักศึกษาหรือบุคลากรของมหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน สมัครด้วยอีเมลโดเมน @rmuti.ac.th หรือ @korat.rmuti.ac.th เท่านั้น",
      "ต้องผ่านการยืนยันตัวตนด้วยรหัส OTP ทางอีเมลและตรวจสอบรหัสประจำตัวนักศึกษาก่อนใช้งาน",
      "ห้ามสร้างบัญชีปลอม แอบอ้างตัวตนผู้อื่น หรือใช้บัญชีร่วมกับผู้อื่น",
    ],
  },
  {
    num: 2,
    title: "การลงประกาศขายสินค้า",
    items: [
      "สินค้าที่ลงประกาศต้องเป็นของถูกกฎหมาย ไม่ละเมิดลิขสิทธิ์ และไม่ผิดศีลธรรม",
      "ห้ามลงขายสินค้าต้องห้าม เช่น อาวุธ สารเสพติด เอกสารปลอม หรือสินค้าลอกเลียนแบบ",
      "ต้องระบุสภาพสินค้า ราคา และรูปภาพจริงตามความเป็นจริง ห้ามใช้ข้อมูลที่ทำให้ผู้ซื้อเข้าใจผิด",
      "อัปโหลดรูปภาพได้สูงสุด 5 รูปต่อสินค้า ขนาดไฟล์ไม่เกิน 5 MB ต่อรูป",
      "ผู้ขายต้องรับผิดชอบต่อความถูกต้องของข้อมูลสินค้าที่ตนเองลงประกาศ",
    ],
  },
  {
    num: 3,
    title: "โพสต์ตามหาสินค้า",
    items: [
      "โพสต์ตามหาสินค้ามีอายุ 7 วัน หลังครบกำหนดจะถูกลบออกจากระบบอัตโนมัติ",
      "เมื่อได้รับสินค้าที่ตามหาแล้ว โพสต์จะไม่แสดงอีกต่อไป",
      "ผู้ขายสามารถเสนอสินค้าที่ตรงหมวดหมู่ไปยังผู้ตามหาได้ผ่านระบบแชท",
    ],
  },
  {
    num: 4,
    title: "มารยาทในการสนทนา",
    items: [
      "ห้ามใช้ถ้อยคำหยาบคาย คุกคาม หรือข่มขู่ผู้ใช้งานอื่นในห้องสนทนา",
      "ห้ามส่งข้อความหรือรูปภาพที่ไม่เหมาะสม ผิดกฎหมาย หรือสแปม",
      "ควรติดต่อซื้อขายผ่านระบบแชทของเว็บไซต์เพื่อให้มีหลักฐานและความปลอดภัย",
    ],
  },
  {
    num: 5,
    title: "การนัดรับสินค้าและเช็คอิน",
    items: [
      "นัดรับสินค้าได้เฉพาะเวลา 08:00 – 20:00 น. ที่จุดนัดรับปลอดภัยภายในมหาวิทยาลัยเท่านั้น",
      "เช็คอินได้เมื่ออยู่ในรัศมี 50 เมตรจากจุดนัดรับ โดย GPS ต้องมีความแม่นยำไม่เกิน 35 เมตร",
      "เมื่อทั้งสองฝ่ายเช็คอินแล้ว ให้ตรวจรับสินค้าและยืนยันการส่งมอบในระบบ",
      "หากไม่มาตามนัดภายใน 45 นาทีหลังเวลานัดหมาย ระบบจะถือว่าเบี้ยวนัด (No-Show) และตัดคะแนนอัตโนมัติ",
    ],
  },
  {
    num: 6,
    title: "คะแนนความน่าเชื่อถือ (Trust Score)",
    items: [
      "ผู้ใช้ทุกคนเริ่มต้นด้วยคะแนน 100 คะแนน",
      "ถูกตัดคะแนนเมื่อเบี้ยวนัด (No-Show) หรือยกเลิกนัดกระชั้นชิด ตามกฎบทลงโทษที่กำหนด",
      "ผู้ใช้ที่มีคะแนนต่ำกว่า 50 คะแนนจะไม่สามารถลงขาย เสนอขาย แชท หรือสร้างนัดหมายได้ ดูและค้นหาสินค้าได้เท่านั้น",
      "คะแนนฟื้นฟูได้ +20 คะแนนเมื่อปิดดีลสำเร็จ และ +5 คะแนนอัตโนมัติทุกวันอาทิตย์ (สูงสุด 100 คะแนน)",
    ],
  },
  {
    num: 7,
    title: "การรีวิวและคืนสินค้า",
    items: [
      "ต้องให้คะแนน (1–5 ดาว) และรีวิวตามประสบการณ์จริง ห้ามรีวิวเท็จหรือปั่นคะแนน",
      "ห้ามใช้หลายบัญชีเพื่อให้คะแนนตัวเองหรือพวกพ้อง",
      "หากสินค้าไม่ตรงตามที่ตกลง สามารถยื่นคำขอคืนสินค้าหรือรายงานปัญหาผ่านระบบได้",
    ],
  },
  {
    num: 8,
    title: "ข้อห้ามทั่วไป",
    items: [
      "ห้ามใช้ระบบเพื่อการหลอกลวง ฉ้อโกง หรือแสวงหาผลประโยชน์โดยมิชอบ",
      "ห้ามพยายามเจาะระบบ โจมตีความปลอดภัย หรือใช้ช่องโหว่ของเว็บไซต์ในทางที่ผิด",
      "ห้ามใช้บอทหรือโปรแกรมอัตโนมัติในการลงประกาศหรือทำธุรกรรมแทนมนุษย์",
    ],
  },
  {
    num: 9,
    title: "บทลงโทษและการดำเนินการของผู้ดูแลระบบ",
    items: [
      "ผู้ดูแลระบบมีสิทธิ์ตรวจสอบ ซ่อน หรือลบประกาศที่ผิดกฎ พร้อมแจ้งเหตุผลให้เจ้าของประกาศทราบ",
      "ผู้ดูแลระบบมีสิทธิ์ระงับสิทธิ์การใช้งาน (ชั่วคราวหรือถาวร) กับผู้ใช้ที่ฝ่าฝืนกฎอย่างร้ายแรงหรือซ้ำซาก",
      "การตัดสินของผู้ดูแลระบบถือเป็นที่สิ้นสุดในกรณีข้อพิพาทภายในแพลตฟอร์ม",
    ],
  },
  {
    num: 10,
    title: "ข้อจำกัดความรับผิดชอบ",
    items: [
      "เว็บไซต์เป็นเพียงตัวกลางในการติดต่อซื้อขายระหว่างผู้ใช้ภายในมหาวิทยาลัย ไม่รับผิดชอบต่อความเสียหายที่เกิดจากการซื้อขายนอกช่องทางที่ระบบกำหนด",
      "ผู้ใช้งานต้องใช้วิจารณญาณและตรวจสอบสินค้าด้วยตนเองก่อนตัดสินใจซื้อขาย",
      "ระบบยังไม่รองรับการชำระเงินออนไลน์ การจ่ายเงินเป็นข้อตกลงระหว่างผู้ซื้อและผู้ขายโดยตรง",
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
