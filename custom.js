document.addEventListener('DOMContentLoaded', function () {
  console.log('Y2Mate loaded. Developer: aks0dev (aks0) - https://github.com/aks0dev/');

  const searchInput = document.querySelector('.y2mate_query.keyword');
  const searchForm = document.querySelector('.search_form');
  const spinner = document.querySelector('.spinner');
  const downloadSection = document.querySelector('.y2mate-download');
  const suggestBox = document.querySelector('.suggesstion-box');

  // Create container for search results / video converter table if not present
  let resultContainer = document.getElementById('search_result');
  if (!resultContainer && downloadSection) {
    resultContainer = document.createElement('div');
    resultContainer.id = 'search_result';
    downloadSection.appendChild(resultContainer);
  }

  // Check URL query parameters for auto-processing e.g. /?v=VIDEO_ID or /?q=QUERY
  const urlParams = new URLSearchParams(window.location.search);
  const initialV = urlParams.get('v') || urlParams.get('q');
  if (initialV) {
    if (searchInput) searchInput.value = initialV;
    processInput(initialV);
  }

  // Mobile navbar & language dropdown toggle handlers
  document.addEventListener('click', function (event) {
    if (event.target.closest('.navbar-toggler')) {
      const headerMenu = document.querySelector('.header-menu');
      if (headerMenu) headerMenu.classList.toggle('collapse');
    } else if (!event.target.closest('.header-menu')) {
      const headerMenu = document.querySelector('.header-menu');
      if (headerMenu) headerMenu.classList.remove('collapse');
    }

    if (event.target.closest('.language')) {
      const dropdown = document.querySelector('.dropdown-menu');
      if (dropdown) dropdown.classList.toggle('open');
    } else if (!event.target.closest('.dropdown-menu')) {
      const dropdown = document.querySelector('.dropdown-menu');
      if (dropdown) dropdown.classList.remove('open');
    }

    // Hide suggestion box on outside click
    if (suggestBox && !event.target.closest('.search_form')) {
      suggestBox.style.display = 'none';
    }
  });

  // Handle Form Submission
  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      hideSuggestions();
      const val = searchInput ? searchInput.value.trim() : '';
      if (val) {
        processInput(val);
      }
    });
  }

  // Handle Input for Autocomplete Suggestions
  let suggestTimeout = null;
  let selectedIndex = -1;

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      const query = searchInput.value.trim();
      clearTimeout(suggestTimeout);

      if (!query || query.length < 2 || isYoutubeUrl(query)) {
        hideSuggestions();
        return;
      }

      suggestTimeout = setTimeout(() => {
        fetchSuggestions(query);
      }, 200);
    });

    searchInput.addEventListener('keydown', function (e) {
      if (!suggestBox || suggestBox.style.display === 'none') return;
      const items = suggestBox.querySelectorAll('li.search_result');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSuggestionHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSuggestionHighlight(items);
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && items[selectedIndex]) {
          e.preventDefault();
          const text = items[selectedIndex].textContent.trim();
          searchInput.value = text;
          hideSuggestions();
          processInput(text);
        }
      } else if (e.key === 'Escape') {
        hideSuggestions();
      }
    });

    searchInput.addEventListener('paste', function () {
      setTimeout(function () {
        const val = searchInput.value.trim();
        if (val) {
          hideSuggestions();
          processInput(val);
        }
      }, 50);
    });
  }

  function fetchSuggestions(query) {
    fetch(`/api/suggest?q=${encodeURIComponent(query)}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          renderSuggestions(data);
        } else {
          hideSuggestions();
        }
      })
      .catch(() => hideSuggestions());
  }

  function renderSuggestions(list) {
    if (!suggestBox) return;
    selectedIndex = -1;
    let itemsHtml = list.map((item, idx) => `
      <li class="search_result" data-index="${idx}">${item}</li>
    `).join('');

    suggestBox.innerHTML = `<ul class="result_box">${itemsHtml}</ul>`;
    suggestBox.style.display = 'block';

    suggestBox.querySelectorAll('li.search_result').forEach(li => {
      li.addEventListener('click', function () {
        const text = this.textContent.trim();
        if (searchInput) searchInput.value = text;
        hideSuggestions();
        processInput(text);
      });

      li.addEventListener('mouseover', function () {
        suggestBox.querySelectorAll('li.search_result').forEach(item => item.classList.remove('selected'));
        this.classList.add('selected');
        selectedIndex = parseInt(this.getAttribute('data-index'), 10);
      });
    });
  }

  function updateSuggestionHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('selected');
        if (searchInput) searchInput.value = item.textContent.trim();
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function hideSuggestions() {
    if (suggestBox) {
      suggestBox.style.display = 'none';
      suggestBox.innerHTML = '';
    }
    selectedIndex = -1;
  }

  function isYoutubeUrl(query) {
    return /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/.test(query) || /^[a-zA-Z0-9_-]{11}$/.test(query);
  }

  // Function to detect YouTube URL or Keyword and process
  function processInput(query) {
    showSpinner(true);
    if (resultContainer) resultContainer.innerHTML = '';

    const ytPattern = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
    const isDirectId = /^[a-zA-Z0-9_-]{11}$/.test(query);
    const match = query.match(ytPattern);

    if (match || isDirectId) {
      const videoId = match ? match[1] : query;
      fetchVideoInfo(videoId);
    } else {
      searchYoutube(query);
    }
  }

  function showSpinner(show) {
    if (spinner) {
      spinner.style.display = show ? 'block' : 'none';
    }
  }

  // Fetch Video Info and Render Conversion Table
  function fetchVideoInfo(videoId) {
    fetch(`/api/info?v=${encodeURIComponent(videoId)}`)
      .then(res => res.json())
      .then(data => {
        showSpinner(false);
        if (data.error) {
          renderError(data.error);
          return;
        }
        renderVideoConverter(data);
      })
      .catch(err => {
        showSpinner(false);
        console.error('Info fetch error:', err);
        renderError('Failed to connect to converter service. Please try again.');
      });
  }

  // Search YouTube by Keyword
  function searchYoutube(query) {
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then(res => res.json())
      .then(data => {
        showSpinner(false);
        if (data.error || !data.results || data.results.length === 0) {
          renderError('No video results found for your search query.');
          return;
        }
        renderSearchResults(data.results);
      })
      .catch(err => {
        showSpinner(false);
        console.error('Search fetch error:', err);
        renderError('Failed to execute search. Please try again.');
      });
  }

  function renderError(msg) {
    if (!resultContainer) return;
    resultContainer.innerHTML = `
      <div class="block_error">
        <p><strong>Error:</strong> ${msg}</p>
      </div>
    `;
  }

  // Render Video Conversion & Download UI
  function renderVideoConverter(info) {
    if (!resultContainer) return;

    let videoRowsHtml = info.videoFormats.map(f => `
      <tr>
        <td>${f.label}</td>
        <td>${f.note}</td>
        <td>
          <button class="download-btn-action downloaded-convert" 
                  data-v="${info.id}" 
                  data-format="${encodeURIComponent(f.formatId)}" 
                  data-type="video" 
                  data-title="${encodeURIComponent(info.title)}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 4px;">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
            </svg>
            Download
          </button>
        </td>
      </tr>
    `).join('');

    let audioRowsHtml = info.audioFormats.map(f => `
      <tr>
        <td>${f.label}</td>
        <td>${f.note}</td>
        <td>
          <button class="download-btn-action downloaded-convert" 
                  data-v="${info.id}" 
                  data-format="${encodeURIComponent(f.formatId)}" 
                  data-type="audio" 
                  data-title="${encodeURIComponent(info.title)}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="vertical-align: middle; margin-right: 4px;">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
            </svg>
            Download
          </button>
        </td>
      </tr>
    `).join('');

    resultContainer.innerHTML = `
      <div class="convert-result" style="margin-top: 30px; text-align: left; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 20px; padding: 24px; backdrop-filter: blur(16px); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
        <div class="col-md-5">
          <div class="thumb_img">
            <img src="${info.thumbnail}" onerror="this.src='${info.fallbackThumb}'" alt="${info.title}" style="width: 100%; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);">
          </div>
          <div class="img-title" style="margin-top: 14px;">
            <h3 style="font-size: 16px; font-weight: 700; line-height: 1.4; color: #f8fafc; margin: 0;">${info.title}</h3>
            <p style="font-size: 13px; color: #94a3b8; margin-top: 6px;">Duration: ${info.duration} | Channel: ${info.channel}</p>
          </div>
        </div>
        <div class="col-md-7 nav-tabsection">
          <ul class="nav-tab" role="tablist" style="border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 15px;">
            <li class="tab-item active" data-tab="tab-video">
              <button type="button" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 10px; padding: 8px 18px; font-weight: 700; cursor: pointer; margin-right: 8px;">Video MP4</button>
            </li>
            <li class="tab-item" data-tab="tab-audio">
              <button type="button" style="background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 8px 18px; font-weight: 700; cursor: pointer;">Audio MP3</button>
            </li>
          </ul>
          <div class="tab-content" style="background: transparent;">
            <div id="tab-video" class="tab-panel active">
              <table class="table-detail" style="width: 100%; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; background: rgba(30, 41, 59, 0.6); color: #f8fafc;">
                <thead>
                  <tr style="background: rgba(15, 23, 42, 0.9); color: #cbd5e1; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <th style="padding: 12px 16px;">Resolution</th>
                    <th style="padding: 12px 16px;">Quality</th>
                    <th style="padding: 12px 16px;">Download</th>
                  </tr>
                </thead>
                <tbody style="color: #f1f5f9;">
                  ${videoRowsHtml}
                </tbody>
              </table>
            </div>
            <div id="tab-audio" class="tab-panel">
              <table class="table-detail" style="width: 100%; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; background: rgba(30, 41, 59, 0.6); color: #f8fafc;">
                <thead>
                  <tr style="background: rgba(15, 23, 42, 0.9); color: #cbd5e1; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <th style="padding: 12px 16px;">Format</th>
                    <th style="padding: 12px 16px;">Quality</th>
                    <th style="padding: 12px 16px;">Download</th>
                  </tr>
                </thead>
                <tbody style="color: #f1f5f9;">
                  ${audioRowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    // Tab switching event listener
    const tabs = resultContainer.querySelectorAll('.nav-tab > li');
    tabs.forEach(tab => {
      tab.addEventListener('click', function () {
        tabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');

        const targetId = this.getAttribute('data-tab');
        const panels = resultContainer.querySelectorAll('.tab-panel');
        panels.forEach(p => p.classList.remove('active'));

        const targetPanel = resultContainer.querySelector('#' + targetId);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });

    // Attach Download Event Handlers
    attachDownloadEvents(resultContainer);
  }

  // Render Search Results Grid
  function renderSearchResults(results) {
    if (!resultContainer) return;

    let itemsHtml = results.map(item => `
      <div class="col-md-3" style="width: 25%; float: left; padding: 10px; box-sizing: border-box;">
        <div class="yt-mate-thumb" data-id="${item.id}" style="background: rgba(15, 23, 42, 0.85); padding: 12px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.12); backdrop-filter: blur(12px); box-shadow: 0 10px 25px rgba(0,0,0,0.4); height: 100%; transition: transform 0.2s ease;">
          <img class="vi_thumimage" src="${item.thumbnail}" alt="${item.title}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px;">
          <div class="search-info" style="margin-top: 10px;">
            <h3 style="font-size: 13px; line-height: 1.4; height: 38px; overflow: hidden; margin-bottom: 6px; color: #f8fafc;">${item.title}</h3>
            <p style="font-size: 11px; color: #94a3b8; margin-bottom: 10px;">${item.duration} • ${item.channel}</p>
            <button class="convert-card-btn downloaded-convert" data-id="${item.id}" style="width: 100%; border: none; font-weight: 700; background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); color: #fff; padding: 8px 0; cursor: pointer; border-radius: 8px; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.35);">
              Convert
            </button>
          </div>
        </div>
      </div>
    `).join('');

    resultContainer.innerHTML = `
      <div id="SearchResultsDiv" style="display: block; overflow: hidden; margin-top: 20px;">
        <h3 style="width: 100%; text-align: left; margin-bottom: 15px; font-size: 20px; color: #f8fafc; font-weight: 700;">Search Results</h3>
        ${itemsHtml}
      </div>
    `;

    // Click handler for search result cards
    resultContainer.querySelectorAll('.convert-card-btn').forEach(btn => {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = this.getAttribute('data-id');
        if (id) {
          if (searchInput) searchInput.value = `https://www.youtube.com/watch?v=${id}`;
          processInput(id);
        }
      });
    });
  }

  // Handle Download button clicks and trigger real-time progress updates
  function attachDownloadEvents(container) {
    container.querySelectorAll('.download-btn-action').forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.classList.contains('downloading')) return;

        const v = this.getAttribute('data-v');
        const format = this.getAttribute('data-format');
        const type = this.getAttribute('data-type');
        const title = this.getAttribute('data-title');

        const originalHtml = this.innerHTML;
        const downloadId = 'dl_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        // Set downloading UI state with real-time progress bar fill
        this.classList.add('downloading');
        this.classList.remove('completed');
        this.innerHTML = `
          <span class="btn-progress-fill" style="width: 1%;"></span>
          <span class="btn-content">
            <svg class="spinner-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="animation: spin 1s linear infinite; flex-shrink: 0;">
              <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            </svg>
            <span class="btn-text">Downloading 1%</span>
          </span>
        `;

        const progressFill = this.querySelector('.btn-progress-fill');
        const btnText = this.querySelector('.btn-text');

        // Connect to SSE Endpoint for real-time percentage
        const eventSource = new EventSource(`/api/download-progress?id=${downloadId}`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const percent = Math.min(100, Math.max(1, Math.round(data.percent || 1)));
            const statusText = data.status || `Downloading ${percent}%`;

            if (progressFill) progressFill.style.width = `${percent}%`;
            if (btnText) btnText.textContent = statusText;
          } catch (e) {
            console.error('SSE data parse error:', e);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
        };

        // Initiate actual download via fetch stream
        const downloadUrl = `/api/download?v=${encodeURIComponent(v)}&format=${format}&type=${encodeURIComponent(type)}&title=${title}&id=${downloadId}`;

        fetch(downloadUrl)
          .then(response => {
            if (!response.ok) throw new Error('Network error during download');

            let filename = (decodeURIComponent(title) || 'video') + (type === 'audio' ? '.mp3' : '.mp4');
            const disposition = response.headers.get('Content-Disposition');
            if (disposition && disposition.includes('filename=')) {
              const match = /filename="?([^";]+)"?/.exec(disposition);
              if (match && match[1]) {
                filename = decodeURIComponent(match[1]);
              }
            }

            return response.blob().then(blob => ({ blob, filename }));
          })
          .then(({ blob, filename }) => {
            eventSource.close();

            if (progressFill) progressFill.style.width = '100%';
            if (btnText) btnText.textContent = '100%';

            // Trigger browser save dialog
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Update button to Completed state
            this.classList.remove('downloading');
            this.classList.add('completed');
            this.innerHTML = `
              <span class="btn-content">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink: 0;">
                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                </svg>
                <span>Completed!</span>
              </span>
            `;

            // Revert back to original state after 3 seconds
            setTimeout(() => {
              this.classList.remove('completed');
              this.innerHTML = originalHtml;
            }, 3000);
          })
          .catch(err => {
            console.error('Download error:', err);
            eventSource.close();
            this.classList.remove('downloading');
            this.style.backgroundColor = '#dc3545';
            this.innerHTML = `<span>Failed! Retry</span>`;

            setTimeout(() => {
              this.style.backgroundColor = '';
              this.innerHTML = originalHtml;
            }, 3000);
          });
      });
    });
  }
});

// Copy UPI ID helper for Buy Me a Coffee (aks0@slc)
function copyUpiId() {
  const upiId = 'aks0@slc';
  navigator.clipboard.writeText(upiId).then(() => {
    const cardBtn = document.getElementById('copyUpiCardBtn');
    const navBtn = document.getElementById('navCoffeeBtn');

    if (cardBtn) {
      const origText = cardBtn.innerHTML;
      cardBtn.innerHTML = '✓ Copied!';
      cardBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      setTimeout(() => {
        cardBtn.innerHTML = origText;
        cardBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      }, 2500);
    }

    if (navBtn) {
      const origText = navBtn.innerHTML;
      navBtn.innerHTML = '✓ Copied!';
      navBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      setTimeout(() => {
        navBtn.innerHTML = origText;
        navBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      }, 2500);
    }
  }).catch(() => {
    alert('Buy Me a Coffee - UPI ID: aks0@slc');
  });
}
