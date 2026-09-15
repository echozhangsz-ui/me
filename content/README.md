# Portfolio Content

Each experience has its own folder under `content/experiences/<company-id>/`.

## Text

- `title.md`: header details for the popup. The page already has fallback data in `experience-data.js`.
- `responsibility.md`: replace this with the responsibility text you want to show.

## Projects

Use the flat project naming pattern:

- `videos/project-01-project-name.mp4`
- `thumbnails/project-01-project-name.png`
- `projects/project-01-project-name.md` optional

The page displays the project name from the filename part after `project-01-`. Use one unique number per project. The optional `.md` file can override the displayed title and description.

Example:

- `videos/project-01-the-voice.mp4`
- `thumbnails/project-01-the-voice.png`
- `projects/project-01-the-voice.md`

If it finds more than three projects, it shows a horizontal scroller. If it finds three or fewer, it keeps the thumbnails static.

You can also keep shared files in:

- `videos/`
- `thumbnails/`

## Hover Preview Cards

Small cards shown beside the constellation node use:

- `cards/card-01.png`
- `cards/card-02.png`
- `cards/card-03.png`

Supported formats are `.png`, `.jpg`, `.jpeg`, and `.webp`. The page checks `card-01` through `card-06`. Add as many card images as you want to show. If there is more than one, the homepage preview arranges them as a small fan without overlapping the cards.

Example cards are currently included for:

- `vtech/cards/card-01.png` and `card-02.png`
- `gameloft/cards/card-01.png`, `card-02.png`, and `card-03.png`

Replace those files with your real cards when ready.
