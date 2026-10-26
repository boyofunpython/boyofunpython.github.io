import { Peer } from "peerjs";
// Keep the existing classroom wire protocol while updating its browser client.
export function createClassroomPeer() {
  return new Peer({
    host: "boyofunpython.ddns.net",
    key: "killkliAPI",
    secure: true,
    port: 9000,
  });
}
