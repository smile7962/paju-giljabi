/* 출장ON AI · 외부 지도/내비 URL만 담당 (서버·API 키 없음) */
(function (root) {
  "use strict";
  function urls(stop, pageUrl) {
    if (!stop || !stop.name || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) {
      throw new Error("길찾기에 필요한 출장지 좌표가 없습니다.");
    }
    const name = encodeURIComponent(stop.name);
    const lat = stop.lat, lng = stop.lng;
    // 모바일 웹 URL은 NAVER 공식 appname 규정에 따라 현재 웹페이지 주소 사용
    const appName = encodeURIComponent(pageUrl || "https://smile7962.github.io/paju-giljabi/v2/mobile.html");
    return {
      kakao: {
        title: "카카오맵",
        app: null,
        web: "https://map.kakao.com/link/to/" + name + "," + lat + "," + lng,
        webLabel: "카카오맵 길찾기",
        install: null
      },
      naver: {
        title: "네이버지도",
        // 출발점은 현재 위치. 경로 확인은 네이버지도 앱에서 진행
        app: "nmap://navigation?dlat=" + lat + "&dlng=" + lng + "&dname=" + name + "&appname=" + appName,
        // 네이버지도 웹의 좌표 기반 길찾기 규격은 공식적으로 보장되지 않아 장소 검색으로 안내
        web: "https://map.naver.com/p/search/" + name,
        webLabel: "네이버지도에서 장소 검색",
        install: /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? "https://apps.apple.com/kr/app/id311867728"
          : "https://play.google.com/store/apps/details?id=com.nhn.android.nmap"
      },
      tmap: {
        title: "T맵",
        // 공개적으로 검증된 앱 스킴 (OS/앱 버전에 따라 지원 여부 상이)
        app: "tmap://route?goalname=" + name + "&goalx=" + lng + "&goaly=" + lat,
        // T맵 좌표 웹길찾기 공식 링크는 확인되지 않았으므로 타사 좌표 기반 지도로 명시
        web: "https://map.kakao.com/link/to/" + name + "," + lat + "," + lng,
        webLabel: "좌표로 카카오맵 열기 (대체)",
        install: /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? "https://apps.apple.com/kr/app/id431589174"
          : "https://play.google.com/store/apps/details?id=com.skt.tmap.ku"
      }
    };
  }
  root.TripNav = { urls };
})(window);