# 사이버캡 셰어 (Cybercab Share)

테슬라 사이버캡 같은 자율주행차의 **유휴 시간을 로보택시로 공유**해 수익을 내는 플랫폼의 웹 데모입니다.
카카오T 스타일의 승객 화면과 차주(오너) 대시보드를 한 페이지에서 오가며 볼 수 있고, 지도는 **실제 카카오맵 JavaScript SDK**로 부산 기장군 정관읍 일대를 그립니다.

- 배포 주소: `https://luke7851-soungouk.github.io/cybercab-share/`
- 현재 상태: 저장소 생성 권한이 없어 아직 배포 전입니다(README 하단 참고).

## 무엇이 실제인가

| 항목 | 구현 |
| --- | --- |
| 지도 | 카카오맵 JS SDK (`dapi.kakao.com/v2/maps/sdk.js`), 일반지도 ↔ 스카이뷰 전환, 확대·축소·드래그 |
| 승차 지점 | 정관읍 중앙공원 `35.322678, 129.180878` |
| 주변 차량 5대 | 실제 위·경도 위에서 정관읍 도로를 따라 이동하는 `CustomOverlay`. 탭하면 차량 정보 팝업 |
| 경로 | `kakao.maps.Polyline` 실주행 경로 + `setBounds` 자동 맞춤 |
| 추천 목적지 7곳 | 기장역·오시리아·센텀시티·해운대·광안리·부산역·김해공항. 거리/시간은 OSRM 실주행 측정값(`routes.js`) |
| 장소 검색 | `kakao.maps.services.Places` 키워드 검색 → 검색한 곳을 목적지로 지정 |
| 요금 | 실거리 × km 요금 + 기본요금, 차량 옵션 3종 배수, 3,000원 쿠폰 |
| 차주 모드 | 유휴 시간대, 수익 운행 ON/OFF, 배터리 복귀 기준, 운행 반경, 수수료 15% 제외 순수익 |

## 실행

```bash
python3 -m http.server 8000     # 이 폴더에서
# http://localhost:8000
```

## 카카오 JavaScript 키 넣기

키가 없으면 앱은 지도 자리에 안내 패널을 띄우고, 나머지 기능(목적지·옵션·결제·차주 모드)은 그대로 동작합니다.

1. [카카오 개발자센터](https://developers.kakao.com) → 내 애플리케이션 → 앱 선택 → **앱 키 → JavaScript 키** 복사
2. **플랫폼 → Web** 에 사이트 도메인 등록
   - `https://luke7851-soungouk.github.io`
   - 로컬 테스트용 `http://localhost:8000`
   (등록하지 않으면 지도 타일이 뜨지 않습니다.)
3. 키를 넣는 세 가지 방법
   - `app.js` 상단 `const KAKAO_JS_KEY = "..."` 에 붙여넣기
   - 배포 주소 뒤에 `?key=발급받은키` 로 한 번 열기 (브라우저에 저장됨)
   - 지도 안내 패널에 붙여넣고 **저장** (브라우저에만 저장)

JavaScript 키는 원래 웹에 노출되는 공개 값이며, 카카오는 **등록된 도메인에서만** 그 키를 쓰도록 제한합니다.

## 파일

```
index.html   화면 구조
app.css      카카오T 스타일 UI + 지도 오버레이 스타일
app.js       앱 로직 (카카오맵·경로·요금·배차·차주 대시보드)
routes.js    실주행 경로 데이터 (OSRM/OpenStreetMap, 2026-11-14 생성)
```

`routes.js` 는 `tools/fetch_routes.py` 로 다시 만들 수 있습니다(정관읍 기준).

## 데이터 출처

- 지도·장소 검색: © Kakao
- 경로·거리: OSRM demo server / © OpenStreetMap contributors (ODbL)
