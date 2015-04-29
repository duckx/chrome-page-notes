#!/bin/bash 

USAGE="
Usage: $0 <base_version> <current_testing_version>
"

base_version=$1
[ -z ${base_version} ] && echo $USAGE && exit

testing_version=$2
[ -z ${testing_version} ] && echo $USAGE && exit

baseVersionDir="/tmp/cpn/base"
testVersionDir="/tmp/cpn/test"
mkdir -p $baseVersionDir $testVersionDir
rm -rf $baseVersionDir/* $testVersionDir/*

# Form new testing versions.
testing_version_suffix=$(echo $testing_version | cut -d"." -f4)
testing_version_base=${testing_version%.${testing_version_suffix}}

testing_version1=${testing_version_base}.`expr $testing_version_suffix + 1`
testing_version2=${testing_version_base}.`expr $testing_version_suffix + 2`

# This is to make sure that we don't archive unnecessary files.
cat > .git/info/attributes << EOF
*.sh export-ignore
*.svg export-ignore
EOF

# Create archive for the base version
git archive --format=tar release-$base_version | (cd $baseVersionDir && tar xf - --exclude tools --exclude .gitignore)
#git archive -o $baseVersionDir/1.tar.gz release-$base_version
cd $baseVersionDir
#tar xzf 1.tar.gz; rm 1.tar.gz
# Modify version and title
sed -i "" -e "s/$base_version/$testing_version1/" manifest.json
sed -i "" -e "s/Page Notes/Page Notes (testing)/" manifest.json
zip -r ../cpn-base.zip .
cd -

# Create archive for the current version
git archive --format=tar HEAD | (cd $testVersionDir && tar xf - --exclude tools --exclude .gitignore)
#git archive -o $testVersionDir/1.tar.gz HEAD
cd $testVersionDir
#tar xzf 1.tar.gz; rm 1.tar.gz

# Modify version and title
sed -i "" -e "s/\(.*\"version\"\: \"\)[[:digit:].]*\(.*\)/\1$testing_version2\2/" manifest.json
sed -i "" -e "s/Page Notes/Page Notes (testing)/" manifest.json
zip -r ../cpn-test.zip .
cd -
