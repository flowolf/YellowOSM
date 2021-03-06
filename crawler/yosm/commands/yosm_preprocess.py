import json
import os
from scrapy.commands import ScrapyCommand


class YosmPreprocessCommand(ScrapyCommand):
    def short_desc(self):
        return "YellowOSM: preprocess data for crawler"

    def run(self, args, opts):
        target_files = []
        INPUT_DIR = 'data/input/'
        OUTPUT_DIR = 'data/output/'
        for filename in os.listdir(INPUT_DIR):
            if not filename.endswith('.json'):
                continue
            with open(INPUT_DIR + filename) as infile:
                target_files.append(
                    [line.strip() for line in infile.read().splitlines() if not line.startswith('{"index": ')]
                )

        targets = [item for sublist in target_files for item in sublist]

        irrelevant_targets = []
        relevant_targets = []
        for t in targets:
            data = json.loads(t)
            if 'website' in data['labels']:
                if 'wegweiser' in data['labels']['website'] or 'email' in data['labels']:
                    irrelevant_targets.append([])
                else:
                    relevant_targets.append(t)

        print('%d lines in dataset, of which %d with both email and website and %d without email but with website' %
              (len(targets), len(irrelevant_targets), len(relevant_targets)))

        with open(OUTPUT_DIR + 'osm_pois_without_email_and_with_website.jsona', 'w') as outfile:
            outfile.write('\n'.join(relevant_targets))
