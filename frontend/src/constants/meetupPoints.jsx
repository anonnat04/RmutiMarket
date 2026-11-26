import {
  Building2, Zap, BookOpen, Utensils, FlaskConical, Store,
  Trophy, BedDouble, Landmark, Cog, Dumbbell, MapPin
} from 'lucide-react';

// พิกัด lat/lng จริงของอาคารใน มทร.อีสาน นครราชสีมา (RMUTI Nakhon Ratchasima)

export const CAMPUS_CENTER = { lat: 14.9860, lng: 102.1195 };
export const CAMPUS_ZOOM = 17;

// พิกัดขอบเขตมหาวิทยาลัย (6 จุดเชื่อมเส้นตรง)
export const CAMPUS_BOUNDARY = [
  [14.991394, 102.121167], // บน (เหนือสุด)
  [14.987801, 102.122438], // ขวากลาง
  [14.982816, 102.122438], // ขวาล่าง
  [14.981854, 102.119919], // ล่างกลาง
  [14.982296, 102.117195], // ล่างซ้าย
  [14.987811, 102.116130], // ซ้ายกลาง
  [14.991394, 102.121167], // ปิดกลับจุดเริ่มต้น
];

const POINT_ICON_MAP = {
  'civil-eng': Building2,
  'ee-building18': Zap,
  'library-cl': BookOpen,
  'canteen39': Utensils,
  'sci-arts': FlaskConical,
  'seven-eleven': Store,
  'stadium': Trophy,
  'business-admin': Building2,
  'dormitory': BedDouble,
  'student-dev': Landmark,
  'eng-tech': Cog,
  'boxing-gym': Dumbbell,
};

export function MeetupPointIcon({ id, point, size = 18, className = '' }) {
  const pointId = id || point?.id;
  const Icon = POINT_ICON_MAP[pointId] || MapPin;
  return <Icon size={size} className={className} strokeWidth={2} />;
}

export const meetupPoints = [
  {
    id: 'civil-eng',
    name: 'ตึกโยธา (วิศวกรรมโยธา)',
    description: 'อาคารเรียนและห้องปฏิบัติการวิศวกรรมโยธา',
    lat: 14.98889,
    lng: 102.11899,
    category: 'building',
  },
  {
    id: 'ee-building18',
    name: 'ตึก 18 ไฟฟ้า',
    description: 'อาคารปฏิบัติการวิศวกรรมไฟฟ้า',
    lat: 14.98947,
    lng: 102.11947,
    category: 'building',
  },
  {
    id: 'library-cl',
    name: 'ตึก CL ห้องสมุด',
    description: 'สำนักวิทยบริการและเทคโนโลยีสารสนเทศ (ศูนย์เรียนรู้กลาง)',
    lat: 14.98758,
    lng: 102.11992,
    category: 'building',
  },
  {
    id: 'canteen39',
    name: 'โรงอาหาร 39',
    description: 'โรงอาหารกลางขนาดใหญ่ มีคนเดินผ่านตลอด ปลอดภัย',
    lat: 14.98478,
    lng: 102.12052,
    category: 'food',
  },
  {
    id: 'sci-arts',
    name: 'คณะวิทยาศาสตร์และศิลปศาสตร์',
    description: 'อาคารเรียนใหญ่ ใกล้โรงอาหาร 39',
    lat: 14.98476,
    lng: 102.12112,
    category: 'building',
  },
  {
    id: 'seven-eleven',
    name: '7-Eleven (เซเว่นในมอ)',
    description: 'ร้านสะดวกซื้อ 24 ชม. จุดนัดรับยอดนิยม สว่างและปลอดภัยสูง',
    lat: 14.98545,
    lng: 102.12037,
    category: 'food',
  },
  {
    id: 'stadium',
    name: 'สนามกีฬากลาง',
    description: 'พื้นที่โล่งกว้าง มีคนสัญจรตลอดเวลา เหมาะนัดรับช่วงเย็น',
    lat: 14.984514,
    lng: 102.118941,
    category: 'landmark',
  },
  {
    id: 'business-admin',
    name: 'คณะบริหารธุรกิจ',
    description: 'อยู่ใจกลางมหาวิทยาลัย ใกล้สระน้ำ',
    lat: 14.986591,
    lng: 102.119614,
    category: 'building',
  },
  {
    id: 'dormitory',
    name: 'หอพักนักศึกษา มทร.อีสาน',
    description: 'โซนหอพักนักศึกษา มีความปลอดภัยสูง',
    lat: 14.982492,
    lng: 102.118994,
    category: 'building',
  },
  {
    id: 'student-dev',
    name: 'กองพัฒนานักศึกษา',
    description: 'ฝ่ายวิชาการ มีเจ้าหน้าที่และ รปภ. คอยดูแล',
    lat: 14.985330,
    lng: 102.117517,
    category: 'building',
  },
  {
    id: 'eng-tech',
    name: 'คณะวิศวกรรมศาสตร์และเทคโนโลยี',
    description: 'โซนวิศวกรรม มีโรงฝึกงานและม้านั่งจำนวนมาก',
    lat: 14.988946,
    lng: 102.120314,
    category: 'building',
  },
  {
    id: 'boxing-gym',
    name: 'สนามมวย มทร.อีสาน',
    description: 'ยิมมวยไทย จุดสังเกตชัดเจน',
    lat: 14.985602,
    lng: 102.119012,
    category: 'landmark',
  },
];

export const getMeetupPointById = (id) => meetupPoints.find((p) => p.id === id);

export const categoryColors = {
  safe: '#16a34a',
  building: '#2563eb',
  landmark: '#7c3aed',
  food: '#ea580c',
  parking: '#64748b',
};

export const categoryLabel = {
  safe: 'จุดปลอดภัย',
  building: 'อาคาร',
  landmark: 'สถานที่สำคัญ',
  food: 'ร้านอาหาร/ร้านค้า',
  parking: 'ที่จอดรถ',
};
