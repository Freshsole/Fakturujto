import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import fakturujtoFavicon from "../fakturujto logo.png";

const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
const faviconLink = existingFavicon ?? document.createElement("link");
faviconLink.rel = "icon";
faviconLink.type = "image/png";
faviconLink.href = fakturujtoFavicon;
if (!existingFavicon) {
  document.head.appendChild(faviconLink);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
