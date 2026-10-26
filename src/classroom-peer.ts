import { Peer } from "peerjs";
// Omit host/key/path/port to use the public PeerServer Cloud and its ICE defaults.
// Let the server assign a random ID so shared-cloud classrooms cannot collide.
export function createClassroomPeer() {
  return new Peer({ secure: true });
}
