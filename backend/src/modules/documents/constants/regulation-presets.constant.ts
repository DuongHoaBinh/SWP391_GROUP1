import { RegulationTemplatePreset } from '../documents.types';

export const REGULATION_PRESET_TEMPLATES: RegulationTemplatePreset[] = [
  {
    key: 'woah_global',
    name: 'Tiêu chuẩn Toàn cầu WOAH/FEI (Global Baseline)',
    region: 'Toàn cầu (Mặc định khi quốc gia chưa có quy chế riêng)',
    description:
      'Bộ tiêu chuẩn bắt buộc tối thiểu theo Tổ chức Thú y Thế giới (WOAH) và Liên đoàn Đua ngựa Quốc tế (FEI). Tự động kích hoạt khi khách hàng chọn quốc gia đến chưa có danh mục quy định riêng.',
    recommendedCountries: ['Global Baseline', 'Australia', 'New Zealand', 'Canada', 'United States'],
    items: [
      {
        documentType: 'horse_passport',
        description:
          'Hộ chiếu ngựa quốc tế FEI (Equine Passport) có sơ đồ nhận dạng đồ họa và vi mạch chuẩn ISO 11784/11785.',
      },
      {
        documentType: 'health_certificate',
        description:
          'Giấy chứng nhận kiểm dịch động vật xuất khẩu quốc tế (Official International Veterinary Health Certificate) cấp trong vòng 48-72h trước khởi hành.',
      },
      {
        documentType: 'vaccination_certificate',
        description:
          'Chứng nhận tiêm phòng Cúm ngựa (Equine Influenza) mũi chính và mũi nhắc lại trong vòng 6 tháng gần nhất.',
      },
      {
        documentType: 'customs_declaration',
        description:
          'Tờ khai hải quan xuất nhập cảnh động vật sống & Giấy phép vận chuyển xuyên biên giới.',
      },
    ],
  },
  {
    key: 'asean',
    name: 'Khối Đông Nam Á (ASEAN Cross-Border Corridor)',
    region: 'Đông Nam Á',
    description:
      'Quy chế thông hành thú y qua các cửa khẩu đường bộ, đường biển và hàng không trong khu vực ASEAN (Singapore, Malaysia, Thái Lan, Việt Nam, v.v.).',
    recommendedCountries: ['Singapore', 'Malaysia', 'Thailand', 'Vietnam', 'Indonesia', 'Philippines', 'Cambodia', 'Laos'],
    items: [
      {
        documentType: 'horse_passport',
        description:
          'Hộ chiếu ngựa quốc tế do FEI hoặc Liên đoàn Đua ngựa Quốc gia cấp, có chứng thực vi mạch microchip và lịch sử thi đấu.',
      },
      {
        documentType: 'health_certificate',
        description:
          'Giấy chứng nhận kiểm dịch động vật xuất khẩu song phương (song ngữ Anh - Việt/Malay/Thai) do Cục Thú y Trung ương cấp trước 72 giờ.',
      },
      {
        documentType: 'vaccination_certificate',
        description:
          'Chứng nhận tiêm phòng cúm ngựa (Equine Influenza) và viêm não Nhật Bản (Japanese Encephalitis) hợp lệ.',
      },
      {
        documentType: 'import_permit',
        description:
          'Giấy phép nhập khẩu động vật sống do Cơ quan Thú y nước nhập cảnh cấp (AVS Singapore, DVS Malaysia, DLD Thái Lan).',
      },
    ],
  },
  {
    key: 'east_asia',
    name: 'Đông Á Tiêu chuẩn cao (Nhật Bản, Hồng Kông, Hàn Quốc)',
    region: 'Đông Á',
    description:
      'Kiểm dịch thú y đặc biệt nghiêm ngặt cho các trung tâm đua ngựa hàng đầu Châu Á: JRA (Nhật Bản), HKJC (Hồng Kông), KRA (Hàn Quốc).',
    recommendedCountries: ['Japan', 'Hong Kong', 'South Korea', 'Taiwan', 'China'],
    items: [
      {
        documentType: 'horse_passport',
        description:
          'Hộ chiếu ngựa FEI kèm chứng thư xác nhận đăng ký của Hiệp hội Đua ngựa (JRA Japan / HKJC Hong Kong / KRA Korea).',
      },
      {
        documentType: 'health_certificate',
        description:
          'Giấy chứng nhận kiểm dịch y tế chính thức của Trạm Kiểm dịch Động vật (AQS Nhật Bản / AFCD Hồng Kông) cấp trong 48h.',
      },
      {
        documentType: 'vaccination_certificate',
        description:
          'Phiếu xét nghiệm phòng thí nghiệm âm tính với Thiếu máu truyền nhiễm ngựa (EIA Coggins Test), Viêm động mạch ngựa (EVA) và Dịch tễ Glanders.',
      },
      {
        documentType: 'quarantine_certificate',
        description:
          'Chứng nhận cách ly kiểm dịch tiền xuất cảnh 14 ngày (Pre-export Quarantine) tại trạm cách ly được phê duyệt.',
      },
      {
        documentType: 'import_permit',
        description:
          'Giấy phép nhập khẩu chính thức từ Bộ Nông Lâm Thủy sản Nhật Bản (MAFF) hoặc Cục Nông nghiệp & Thủy sản Hồng Kông (AFCD).',
      },
    ],
  },
  {
    key: 'middle_east',
    name: 'Vùng Vịnh / Trung Đông (UAE, Qatar, Saudi Arabia)',
    region: 'Trung Đông',
    description:
      'Quy chế vận chuyển ngựa thi đấu quốc tế tại Dubai World Cup, Saudi Cup, Al Shaqab Doha với yêu cầu nghiêm ngặt về Dịch tả ngựa Châu Phi (AHS).',
    recommendedCountries: ['United Arab Emirates', 'Qatar', 'Saudi Arabia', 'Bahrain', 'Oman', 'Kuwait'],
    items: [
      {
        documentType: 'horse_passport',
        description:
          'Hộ chiếu ngựa quốc tế FEI / Emirates Racing Authority (ERA) hoặc Qatar Racing & Equestrian Club (QREC).',
      },
      {
        documentType: 'health_certificate',
        description:
          'Giấy chứng nhận kiểm dịch thú y đạt chuẩn Bộ Biến đổi Khí hậu & Môi trường UAE (MOCCAE) hoặc Bộ Đô thị Qatar (MECC).',
      },
      {
        documentType: 'vaccination_certificate',
        description:
          'Chứng nhận xét nghiệm PCR âm tính với Dịch tả ngựa Châu Phi (African Horse Sickness - AHS) và Cúm ngựa.',
      },
      {
        documentType: 'customs_declaration',
        description:
          'Tờ khai Hải quan điện tử & Sổ tạm quản ATA Carnet tạm nhập tái xuất phục vụ thi đấu thể thao quốc tế.',
      },
    ],
  },
  {
    key: 'eu_standard',
    name: 'Liên minh Châu Âu (EU - TRACES NT Protocol)',
    region: 'Châu Âu',
    description:
      'Tiêu chuẩn thông quan và kiểm soát y tế thú y trên hệ thống chứng chỉ số TRACES-NT của Liên minh Châu Âu (EU 2021/963).',
    recommendedCountries: ['France', 'Germany', 'United Kingdom', 'Ireland', 'Netherlands', 'Belgium', 'Italy'],
    items: [
      {
        documentType: 'horse_passport',
        description:
          'Hộ chiếu ngựa FEI nhận diện 30 ngày theo quy định Ủy ban Châu Âu (Regulation EU 2021/963) kèm vi mạch transponder.',
      },
      {
        documentType: 'health_certificate',
        description:
          'Chứng thư kiểm dịch điện tử TRACES-NT Official Animal Health Certificate được phê duyệt bởi cơ quan thú y có thẩm quyền.',
      },
      {
        documentType: 'vaccination_certificate',
        description:
          'Sổ tiêm chủng Cúm ngựa và Uốn ván (Equine Influenza & Tetanus) theo đúng lộ trình quy chuẩn EU Directive.',
      },
      {
        documentType: 'import_permit',
        description:
          'Giấy phép thông quan tại Trạm Kiểm soát Biên giới chỉ định của EU (BIP - Border Inspection Post).',
      },
    ],
  },
  {
    key: 'vietnam_domestic',
    name: 'Vận chuyển Nội địa Việt Nam',
    region: 'Việt Nam',
    description:
      'Quy định vận chuyển ngựa đua giữa các trường đua, câu lạc bộ cưỡi ngựa và trang trại huấn luyện trên lãnh thổ Việt Nam.',
    recommendedCountries: ['Vietnam'],
    items: [
      {
        documentType: 'health_certificate',
        description:
          'Giấy chứng nhận kiểm dịch động vật vận chuyển nội tỉnh / liên tỉnh do Chi cục Thú y cấp (Mẫu 15b-TY).',
      },
      {
        documentType: 'vaccination_certificate',
        description:
          'Sổ theo dõi tiêm phòng định kỳ và kết quả xét nghiệm âm tính các bệnh dịch tễ truyền nhiễm theo mùa.',
      },
      {
        documentType: 'horse_passport',
        description:
          'Hồ sơ lý lịch giống, thẻ định danh vi mạch microchip và giấy xác nhận quyền sở hữu ngựa đua.',
      },
    ],
  },
];
