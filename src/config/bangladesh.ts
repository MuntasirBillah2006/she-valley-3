export type DeliveryZone = 'DHAKA_METRO' | 'SUB_DHAKA' | 'OUTSIDE_DHAKA';

export interface DivisionOption {
  nameEn: string;
  nameBn: string;
  districts: {
    nameEn: string;
    nameBn: string;
    defaultZone: DeliveryZone;
    areas: string[];
  }[];
}

export const BANGLADESH_DIVISIONS: readonly DivisionOption[] = [
  {
    nameEn: 'Dhaka',
    nameBn: 'ঢাকা',
    districts: [
      {
        nameEn: 'Dhaka',
        nameBn: 'ঢাকা',
        defaultZone: 'DHAKA_METRO',
        areas: [
          'Dhanmondi',
          'Gulshan',
          'Banani',
          'Uttara',
          'Mirpur',
          'Mohammadpur',
          'Bashundhara R/A',
          'Badda',
          'Motijheel',
          'Khilgaon',
          'Wari',
          'Savar (Sub-Dhaka)',
          'Keraniganj (Sub-Dhaka)',
        ],
      },
      {
        nameEn: 'Gazipur',
        nameBn: 'গাজীপুর',
        defaultZone: 'SUB_DHAKA',
        areas: ['Tongi', 'Gazipur Sadar', 'Joydebpur', 'Kaliakoir'],
      },
      {
        nameEn: 'Narayanganj',
        nameBn: 'নারায়ণগঞ্জ',
        defaultZone: 'SUB_DHAKA',
        areas: ['Chashara', 'Fatullah', 'Siddhirganj', 'Sonargaon'],
      },
      {
        nameEn: 'Tangail',
        nameBn: 'টাঙ্গাইল',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Tangail Sadar', 'Mirzapur', 'Madhupur'],
      },
    ],
  },
  {
    nameEn: 'Chattogram',
    nameBn: 'চট্টগ্রাম',
    districts: [
      {
        nameEn: 'Chattogram',
        nameBn: 'চট্টগ্রাম',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['GEC Circle', 'Agrabad', 'Nasirabad', 'Panchlaish', 'Halishahar', 'Patenga'],
      },
      {
        nameEn: "Cox's Bazar",
        nameBn: 'কক্সবাজার',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ["Cox's Bazar Sadar", 'Teknaf', 'Chakaria'],
      },
      {
        nameEn: 'Cumilla',
        nameBn: 'কুমিল্লা',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Kandirpar', 'Cumilla Sadar', 'Chauddagram'],
      },
    ],
  },
  {
    nameEn: 'Sylhet',
    nameBn: 'সিলেট',
    districts: [
      {
        nameEn: 'Sylhet',
        nameBn: 'সিলেট',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Zindabazar', 'Amberkhana', 'Shahjalal Upashahar', 'Beanibazar'],
      },
      {
        nameEn: 'Moulvibazar',
        nameBn: 'মৌলভীবাজার',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Moulvibazar Sadar', 'Sreemangal'],
      },
    ],
  },
  {
    nameEn: 'Rajshahi',
    nameBn: 'রাজশাহী',
    districts: [
      {
        nameEn: 'Rajshahi',
        nameBn: 'রাজশাহী',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Shaheb Bazar', 'Boalia', 'Motihar', 'Rajpara'],
      },
      {
        nameEn: 'Bogura',
        nameBn: 'বগুড়া',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Satmatha', 'Bogura Sadar', 'Sherpur'],
      },
    ],
  },
  {
    nameEn: 'Khulna',
    nameBn: 'খুলনা',
    districts: [
      {
        nameEn: 'Khulna',
        nameBn: 'খুলনা',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Shib Bari', 'Sonadanga', 'Khalishpur', 'Daulatpur'],
      },
      {
        nameEn: 'Jashore',
        nameBn: 'যশোর',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Jashore Sadar', 'Benapole'],
      },
    ],
  },
  {
    nameEn: 'Barishal',
    nameBn: 'বরিশাল',
    districts: [
      {
        nameEn: 'Barishal',
        nameBn: 'বরিশাল',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Sadar Road', 'Nathullabad', 'Rupatali'],
      },
    ],
  },
  {
    nameEn: 'Rangpur',
    nameBn: 'রংপুর',
    districts: [
      {
        nameEn: 'Rangpur',
        nameBn: 'রংপুর',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Jahaj Company More', 'Rangpur Sadar', 'Lalbagh'],
      },
    ],
  },
  {
    nameEn: 'Mymensingh',
    nameBn: 'ময়মনসিংহ',
    districts: [
      {
        nameEn: 'Mymensingh',
        nameBn: 'ময়মনসিংহ',
        defaultZone: 'OUTSIDE_DHAKA',
        areas: ['Ganginarpar', 'Town Hall', 'Charpara'],
      },
    ],
  },
] as const;

export interface DeliveryChargeConfig {
  DHAKA_METRO: number;
  SUB_DHAKA: number;
  OUTSIDE_DHAKA: number;
  freeDeliveryThresholdBdt: number;
}

export const DEFAULT_DELIVERY_CHARGES: DeliveryChargeConfig = {
  DHAKA_METRO: 70,
  SUB_DHAKA: 100,
  OUTSIDE_DHAKA: 130,
  freeDeliveryThresholdBdt: 2500,
};

export function inferDeliveryZone(district: string, area: string): DeliveryZone {
  const normDistrict = district.trim().toLowerCase();
  const normArea = area.trim().toLowerCase();
  if (normDistrict === 'dhaka') {
    if (normArea.includes('savar') || normArea.includes('keraniganj') || normArea.includes('sub-dhaka')) {
      return 'SUB_DHAKA';
    }
    return 'DHAKA_METRO';
  }
  if (normDistrict === 'gazipur' || normDistrict === 'narayanganj') {
    return 'SUB_DHAKA';
  }
  return 'OUTSIDE_DHAKA';
}

export function calculateDeliveryFeeBdt(
  zone: DeliveryZone,
  subtotalBdt: number,
  config: DeliveryChargeConfig = DEFAULT_DELIVERY_CHARGES,
): number {
  if (config.freeDeliveryThresholdBdt > 0 && subtotalBdt >= config.freeDeliveryThresholdBdt) {
    return 0;
  }
  return config[zone] ?? config.OUTSIDE_DHAKA;
}

export const BD_PHONE_REGEX = /^(\+?88)?01[3-9]\d{8}$/;

export function normalizeBdPhone(phone: string): string {
  const digits = phone.replace(/[\s-]/g, '');
  if (digits.startsWith('+880')) {
    return digits.slice(3);
  }
  if (digits.startsWith('880')) {
    return digits.slice(2);
  }
  return digits;
}
