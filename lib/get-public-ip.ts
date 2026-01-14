import fetchCore from "@/lib/fetch-core.ts";

type PublicIPs = { ipv4: string | null, ipv6: string | null };

export async function getPublicIPsWithApi(timeout = 2000) {
  const results: PublicIPs = { ipv4: null, ipv6: null };

  [results.ipv4, results.ipv6] = await Promise.all([
    fetchCore("https://api4.ipify.org", { timeout })
      .then((response) => response.text())
      // @ts-ignore
      .catch((err) => console.error(err) || null),
    fetchCore("https://api6.ipify.org", { timeout })
      .then((response) => response.text())
      // @ts-ignore
      .catch((err) => console.error(err) || null),
  ]);

  return results;
}

export function getPublicIPsWithWebRTC(timeout = 2000): Promise<PublicIPs> {
  return new Promise((resolve) => {
    const results: PublicIPs = { ipv4: null, ipv6: null };

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.createDataChannel("");
    pc.createOffer().then(offer => pc.setLocalDescription(offer));

    pc.onicecandidate = (ice) => {
      if (!ice || !ice.candidate || ice.candidate.type !== "srflx" || !ice.candidate.address) return;

      const ip = ice.candidate.address;
      if (ip.includes(":")) {
        results.ipv6 = ip;
      } else {
        results.ipv4 = ip;
      }

      if (results.ipv4 && results.ipv6) {
        finish();
      }
    };

    const finish = () => {
      pc.close();
      resolve(results);
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        finish();
      }
    };

    setTimeout(finish, timeout);
  });
}
