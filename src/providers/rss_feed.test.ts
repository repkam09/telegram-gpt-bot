import { buildGuidForEntry } from "./rss_feed";

const AMD_CUDA_ITEM_1 = {"creator":"danzheng","title":"AMD may get across the CUDA moat","link":"https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/","pubDate":"Fri, 06 Oct 2023 17:35:36 +0000","dc:creator":"danzheng","comments":"https://news.ycombinator.com/item?id=37793635","content":"\n<p>Article URL: <a href=\"https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/\">https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/</a></p>\n<p>Comments URL: <a href=\"https://news.ycombinator.com/item?id=37793635\">https://news.ycombinator.com/item?id=37793635</a></p>\n<p>Points: 289</p>\n<p># Comments: 174</p>\n","contentSnippet":"Article URL: https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/\nComments URL: https://news.ycombinator.com/item?id=37793635\nPoints: 289\n# Comments: 174","guid":"https://news.ycombinator.com/item?id=37793635","isoDate":"2023-10-06T17:35:36.000Z"};
const AMD_CUDA_ITEM_2 = {"creator":"danzheng","title":"AMD may get across the CUDA moat","link":"https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/","pubDate":"Fri, 06 Oct 2023 17:35:36 +0000","dc:creator":"danzheng","comments":"https://news.ycombinator.com/item?id=37793635","content":"\n<p>Article URL: <a href=\"https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/\">https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/</a></p>\n<p>Comments URL: <a href=\"https://news.ycombinator.com/item?id=37793635\">https://news.ycombinator.com/item?id=37793635</a></p>\n<p>Points: 294</p>\n<p># Comments: 177</p>\n","contentSnippet":"Article URL: https://www.hpcwire.com/2023/10/05/how-amd-may-get-across-the-cuda-moat/\nComments URL: https://news.ycombinator.com/item?id=37793635\nPoints: 294\n# Comments: 177","guid":"https://news.ycombinator.com/item?id=37793635","isoDate":"2023-10-06T17:35:36.000Z"};

describe("rss_feed provider", () => {
    test("feed indexing", async () => {
        const result1 = buildGuidForEntry(AMD_CUDA_ITEM_1);
        const result2 = buildGuidForEntry(AMD_CUDA_ITEM_2);

        expect(result1).toBe(result2);
    });
});