import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";
import { installErrorBuffer } from "./lib/errorBuffer";
import { installStaleChunkReload } from "./lib/staleChunkReload";

installErrorBuffer();
installStaleChunkReload();

createRoot(document.getElementById("root")!).render(<App />);
