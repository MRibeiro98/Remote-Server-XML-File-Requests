const fs = require("fs");
const axios = require("axios");

const OUTFILE = "group2_results.xml";
const INFILE = "dataset.xml";
const API_KEY = "4cafb082a43997304886b6ab1ece2ffbaa09"; 
const API_URL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed`;
const ID_REGEX = /<Id>([0-9]*)<\/Id>/g;//searches for a number between ID tags, and then match it
const TITLE_REGEX = /<ArticleTitle>(.*?)<\/ArticleTitle>/g;//matches any characters within article title tags

const rate_limit = API_KEY ? 10 : 3; //uses rate limit of 10 instead of 3 as long as APIkey is provided
const rate_limit_period = 1000; // 1 second

function extractTitleIDFromResponse(response) {
  let idList = [...response.data.matchAll(ID_REGEX)];
  let firstId = null;

  if (idList && idList[0]) firstId = idList[0][1];//Checks if array is empty. If array is not empty, grabs the first ID
  return firstId;
}

async function getPromiseForTitle(title) {
  let term = encodeURIComponent(title);

  const url = `${API_URL}${
    API_KEY ? `&api_key=${API_KEY}` : ""
  }&field=title&term=${term}`;
//builds url with all the components
  return axios.get(url);//returns get request promise
}

function writeBufferToFile(filename, buffer) {
  fs.appendFileSync(
    filename,
    buffer
      .map(//takes everything in buffer, and maps each thing in the bucket to the xml block
        (article) =>
          `
  <PubmedArticle>
    <PMID>${article.id}</PMID>
    <ArticleTitle>${article.title}</ArticleTitle>
  </PubmedArticle>`
      )
      .join("")//takes all the xml blocks and combines them into one string, and then we write the string to file
  );
}

async function flushBuffer(buffer) {
  const responses = await Promise.all(//waits for all requests in the bucket to complete
    buffer.map((prom_obj) => prom_obj.promise)//for every promise object, instead of returning the whole oject, jsut returns promise part of it
  );

  const results = responses.map((res, i) => {//takes resposes from the server and converts it back into an object which contains title and ID
    return {
      title: buffer[i].title,
      id: extractTitleIDFromResponse(res),//takes response and looks for first ID
    };
  });
  writeBufferToFile(OUTFILE, results);
}

let data = fs.readFileSync(INFILE).toString();
let matches = data.matchAll(TITLE_REGEX);
//parses file and finds all the titles
(async function () {
  fs.writeFileSync(OUTFILE, "<PubmedArticleSet>");

 
  let bucket = [];//start with empty bucket

  console.time();
  for (const m of matches) {//goes through all the titles
    let title = m[1];

    let prom = getPromiseForTitle(title);
 
    bucket.push({ title: title, promise: prom });//adds the title to the bucket with its promise
  
    if (bucket.length == rate_limit) {//checks if there is 10 requests 
      await flushBuffer(bucket);//writes what is in bucket to file
      bucket = [];//emptys buffer

      let waitUntil = new Date(Date.now() + rate_limit_period);//creating a new date with the current time, and waits 1 second 
      while (waitUntil > Date.now()) {}//loop infinitely until you reach the waituntil time
    }
  }

  await flushBuffer(bucket);//once u are out of the loop flush what is remaining in buffer

  console.timeEnd();
  fs.appendFileSync(OUTFILE, "\n</PubmedArticleSet>");
})();
